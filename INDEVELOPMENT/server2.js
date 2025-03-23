const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

app.use(express.json());

// Функция для выполнения запросов к InnerTube API
async function makeInnerTubeRequest(endpoint, body) {
    const response = await axios.post(`https://www.youtube.com/youtubei/v1/${endpoint}`, body, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    return response.data;
}

// Поиск видео
app.post('/youtube/search', async (req, res) => {
    try {
        const oldFormatRequest = req.body;

        const newFormatRequest = {
            query: oldFormatRequest.searchQuery,
            maxResults: oldFormatRequest.maxResults || 10,
            type: 'video'
        };

        const response = await makeInnerTubeRequest('search', newFormatRequest);

        const oldFormatResponse = response.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents.map(item => ({
            videoId: item.videoRenderer.videoId,
            title: item.videoRenderer.title.runs[0].text,
            description: item.videoRenderer.descriptionSnippet ? item.videoRenderer.descriptionSnippet.runs[0].text : '',
            thumbnail: item.videoRenderer.thumbnail.thumbnails[0].url
        }));

        res.json(oldFormatResponse);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Получение информации о видео
app.post('/youtube/video', async (req, res) => {
    try {
        const oldFormatRequest = req.body;

        const newFormatRequest = {
            videoId: oldFormatRequest.videoId
        };

        const response = await makeInnerTubeRequest('player', newFormatRequest);

        const oldFormatResponse = {
            videoId: response.videoDetails.videoId,
            title: response.videoDetails.title,
            description: response.videoDetails.shortDescription,
            thumbnail: response.videoDetails.thumbnail.thumbnails[0].url,
            duration: response.videoDetails.lengthSeconds
        };

        res.json(oldFormatResponse);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Получение списка воспроизведения
app.post('/youtube/playlist', async (req, res) => {
    try {
        const oldFormatRequest = req.body;

        const newFormatRequest = {
            playlistId: oldFormatRequest.playlistId,
            maxResults: oldFormatRequest.maxResults || 10
        };

        const response = await makeInnerTubeRequest('playlist', newFormatRequest);

        const oldFormatResponse = response.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents.map(item => ({
            videoId: item.playlistVideoRenderer.videoId,
            title: item.playlistVideoRenderer.title.runs[0].text,
            description: item.playlistVideoRenderer.descriptionSnippet ? item.playlistVideoRenderer.descriptionSnippet.runs[0].text : '',
            thumbnail: item.playlistVideoRenderer.thumbnail.thumbnails[0].url
        }));

        res.json(oldFormatResponse);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
