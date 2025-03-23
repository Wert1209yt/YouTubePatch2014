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

    // Дефолтная обработка
    return forwardToYoutubeAPI(path, method, query);
}

// Получение данных канала
async function getChannelData(params) {
    const [channelResponse, videosResponse] = await Promise.all([
        axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: {
                part: 'snippet,contentDetails,statistics',
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

    return {
        entry: {
            id: channelResponse.data.items[0].id,
            title: channelResponse.data.items[0].snippet.title,
            videos: videosResponse.data.items.map(video => ({
                id: video.id.videoId,
                title: video.snippet.title,
                published: video.snippet.publishedAt
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
                thumbnail: item.snippet.thumbnails.default.url
            }))
        }
    };
}

app.listen(port, () => {
    console.log(`Прокси-сервер запущен на порту ${port}`);
});
