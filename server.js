const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;
const xmlbuilder = require('xmlbuilder');
const app = express();
const port = 3000;

// Конфигурация OAuth 2.0
const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'YOUR_REDIRECT_URI';
const API_KEY = 'YOUR_YOUTUBE_API_KEY';

const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Основной прокси-эндпоинт
app.use(express.json());
app.use('/feeds/api', async (req, res) => {
    try {
        const response = await handleGDataRequest(req);
        res.set('Content-Type', 'application/atom+xml');
        res.send(response);
    } catch (error) {
        res.status(500).json({ error: 'API Error' });
    }
});

async function handleGDataRequest(req) {
    const { path, method, query, body } = req;

    // Эндпоинты GData
    if (path.includes('/videos')) {
        return getVideos(query);
    }
    if (path.includes('/users')) {
        return getUserProfile(query);
    }
    if (path.includes('/channels')) {
        return getChannelData(query);
    }
    if (path.includes('/activities')) {
        return getActivities(query);
    }
    if (path.includes('/playlists')) {
        return getPlaylists(query);
    }
    if (path.includes('/comments')) {
        return getComments(query);
    }

    // Дефолтная обработка
    return forwardToYoutubeAPI(path, method, query);
}

// Получение видео
async function getVideos(params) {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
            part: 'snippet,statistics',
            id: params.id,
            key: API_KEY
        }
    });

    return transformToAtom(response.data.items, 'video');
}

// Получение профиля пользователя
async function getUserProfile(params) {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: {
            part: 'snippet,statistics',
            forUsername: params.username,
            key: API_KEY
        }
    });

    return transformToAtom(response.data.items, 'user');
}

// Получение данных канала
async function getChannelData(params) {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: {
            part: 'snippet,statistics',
            id: params.id,
            key: API_KEY
        }
    });

    return transformToAtom(response.data.items, 'channel');
}

// Получение активности
async function getActivities(params) {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/activities', {
        params: {
            part: 'snippet,contentDetails',
            channelId: params.channelId,
            key: API_KEY
        }
    });

    return transformToAtom(response.data.items, 'activity');
}

// Получение плейлистов
async function getPlaylists(params) {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/playlists', {
        params: {
            part: 'snippet',
            channelId: params.channelId,
            key: API_KEY
        }
    });

    return transformToAtom(response.data.items, 'playlist');
}

// Получение комментариев
async function getComments(params) {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/commentThreads', {
        params: {
            part: 'snippet',
            videoId: params.videoId,
            key: API_KEY
        }
    });

    return transformToAtom(response.data.items, 'comment');
}

// Дефолтная обработка запросов
async function forwardToYoutubeAPI(path, method, query) {
    const response = await axios({
        method,
        url: `https://www.googleapis.com/youtube/v3${path}`,
        params: {
            ...query,
            key: API_KEY
        }
    });

    return transformToAtom(response.data.items, 'default');
}

// Преобразование в формат Atom/XML
function transformToAtom(items, type) {
    const feed = xmlbuilder.create('feed', { encoding: 'UTF-8' })
        .att('xmlns', 'http://www.w3.org/2005/Atom')
        .att('xmlns:media', 'http://search.yahoo.com/mrss/')
        .att('xmlns:yt', 'http://gdata.youtube.com/schemas/2007');

    items.forEach(item => {
        const entry = feed.ele('entry');
        entry.ele('id', {}, item.id);
        entry.ele('title', {}, item.snippet.title);
        entry.ele('published', {}, item.snippet.publishedAt);

        if (type === 'video') {
            entry.ele('media:group', {}, {
                'media:thumbnail': { url: item.snippet.thumbnails.default.url },
                'media:description': item.snippet.description
            });
        }

        if (type === 'user' || type === 'channel') {
            entry.ele('yt:statistics', {}, {
                viewCount: item.statistics.viewCount,
                subscriberCount: item.statistics.subscriberCount
            });
        }
    });

    return feed.end({ pretty: true });
}

// Запуск сервера
app.listen(port, () => {
    console.log(`Прокси-сервер запущен на порту ${port}`);
});
