const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;
const app = express();
const port = 3000;

// Конфигурация OAuth 2.0
const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'YOUR_REDIRECT_URI';
const API_KEY = 'YOUR_YOUTUBE_API_KEY';

const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Эмуляция данных для дизлайков (используем сторонний источник)
const dislikeService = axios.create({
    baseURL: 'https://returnyoutubedislikeapi.com'
});

// Основной прокси-эндпоинт
app.use(express.json());
app.use('/feeds/api', async (req, res) => {
    try {
        const response = await handleGDataRequest(req);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'API Error' });
    }
});

async function handleGDataRequest(req) {
    const { path, method, query, body } = req;
    
    // Эмуляция главной страницы канала
    if (path.includes('/channels')) {
        return getChannelData(query);
    }

    // Обработка лайков/дизлайков
    if (path.includes('/videos/rate')) {
        return rateVideo(body);
    }

    // Получение рекомендаций
    if (path.includes('/activities')) {
        return getRecommendations(query);
    }

    // Обработка поиска с фильтрами
    if (path.includes('/videos')) {
        return handleSearchRequest(query);
    }

    // Подписка на канал
    if (path.includes('/subscriptions')) {
        return subscribeToChannel(body);
    }

    // Дефолтная обработка
    return forwardToYoutubeAPI(path, method, query);
}

// Получение данных канала
async function getChannelData(params) {
    const [channelResponse, videosResponse] = await Promise.all([
        axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: {
                part: 'snippet,statistics',
                id: params.id,
                key: API_KEY
            }
        }),
        axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                channelId: params.id,
                maxResults: 20,
                order: 'date',
                key: API_KEY
            }
        })
    ]);

    const channelInfo = channelResponse.data.items[0];
    return {
        entry: {
            id: channelInfo.id,
            title: channelInfo.snippet.title,
            description: channelInfo.snippet.description,
            avatar: channelInfo.snippet.thumbnails.default.url,
            subscriberCount: channelInfo.statistics.subscriberCount,
            viewCount: channelInfo.statistics.viewCount,
            videos: videosResponse.data.items.map(video => ({
                id: video.id.videoId,
                title: video.snippet.title,
                published: video.snippet.publishedAt,
                thumbnail: video.snippet.thumbnails.default.url,
                viewCount: video.statistics?.viewCount || 0
            }))
        }
    };
}

// Обработка рейтингов
async function rateVideo(data) {
    const [youtubeResponse, dislikeResponse] = await Promise.all([
        axios.post(`https://www.googleapis.com/youtube/v3/videos/rate?id=${data.videoId}&rating=${data.rating}&key=${API_KEY}`),
        dislikeService.post('/votes', {
            videoId: data.videoId,
            rating: data.rating
        })
    ]);

    return {
        status: 'success',
        likes: youtubeResponse.data.likeCount,
        dislikes: dislikeResponse.data.dislikes
    };
}

// Получение рекомендаций
async function getRecommendations(params) {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/activities', {
        params: {
            part: 'snippet,contentDetails',
            home: true,
            maxResults: params['max-results'] || 10,
            key: API_KEY
        }
    });

    return {
        feed: {
            entry: response.data.items.map(item => ({
                id: item.contentDetails.upload.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.default.url,
                viewCount: item.statistics?.viewCount || 0
            }))
        }
    };
}

// Обработка поиска с фильтрами
async function handleSearchRequest(params) {
    const v3Params = convertGDataToV3(params);
    
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
            part: 'snippet',
            type: 'video',
            key: API_KEY,
            ...v3Params
        }
    });

    return transformSearchResults(response.data);
}

// Подписка на канал
async function subscribeToChannel(data) {
    const response = await axios.post('https://www.googleapis.com/youtube/v3/subscriptions', {
        snippet: {
            resourceId: {
                channelId: data.channelId
            }
        }
    }, {
        params: {
            part: 'snippet',
            key: API_KEY
        },
        headers: {
            Authorization: `Bearer ${oauth2Client.credentials.access_token}`
        }
    });

    return {
        status: 'success',
        subscriptionId: response.data.id
    };
}

// Конвертация параметров gdata 2.1 → v3
function convertGDataToV3(params) {
    const mapping = {
        // Базовые параметры
        'q': 'q',
        'max-results': 'maxResults',
        'start-index': 'pageToken',
        
        // Фильтры
        'orderby': {
            'relevance': 'relevance',
            'published': 'date',
            'viewCount': 'viewCount',
            'rating': 'rating'
        },
        
        'time': {
            'today': getDate(-1),
            'this_week': getDate(-7),
            'this_month': getDate(-30)
        },
        
        'duration': {
            'short': 'short',
            'medium': 'medium',
            'long': 'long'
        },
        
        'uploader': {
            'partner': { videoSyndicated: true },
            'youtube': { videoType: 'any' }
        }
    };

    const v3Params = {};
    
    // Конвертация каждого параметра
    for (const [key, value] of Object.entries(params)) {
        if (key === 'time') {
            v3Params.publishedAfter = mapping.time[value];
        } 
        else if (key === 'duration') {
            v3Params.videoDuration = mapping.duration[value];
        }
        else if (key === 'orderby') {
            v3Params.order = mapping.orderby[value];
        }
        else if (mapping[key]) {
            v3Params[mapping[key]] = value;
        }
    }

    return v3Params;
}

// Преобразование результатов поиска
function transformSearchResults(data) {
    return {
        feed: {
            xmlns: 'http://www.w3.org/2005/Atom',
            'openSearch:totalResults': data.pageInfo.totalResults,
            'openSearch:startIndex': data.pageInfo.resultsPerPage,
            entry: data.items.map(item => ({
                id: item.id.videoId,
                title: item.snippet.title,
                published: item.snippet.publishedAt,
                media: {
                    group: {
                        thumbnail: item.snippet.thumbnails.default.url,
                        description: item.snippet.description
                    }
                },
                viewCount: item.statistics?.viewCount || 0
            }))
        }
    };
}

// Вспомогательная функция для дат
function getDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() + daysAgo);
    return date.toISOString();
}

app.listen(port, () => {
    console.log(`Прокси-сервер запущен на порту ${port}`);
});
