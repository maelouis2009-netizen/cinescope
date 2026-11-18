// sources/youtube.js
// Recherche de vidéos YouTube (trailers, films gratuits mis en ligne légalement).
// On utilise l'API publique de YouTube via une clé simple (optionnelle).
// Sans clé, on utilise une recherche via l'API "invidious" publique (fallback).

const axios = require('axios');

// ⚠️ Optionnel : une clé API YouTube (gratuite) améliore la fiabilité.
// Sans clé, on utilise une instance publique d'Invidious.
const YT_API_KEY = process.env.YOUTUBE_API_KEY || null;
const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://yewtu.be',
    'https://invidious.nerdvpn.de'
];

/**
 * Recherche des vidéos YouTube.
 * @param {string} query - Texte recherché
 * @param {number} limit - Nombre max de résultats
 * @returns {Promise<Array>} Liste de vidéos au format "meta" Stremio
 */
async function searchVideos(query, limit = 15) {
    // Priorité : API officielle YouTube si la clé est fournie
    if (YT_API_KEY) {
        try {
            const resp = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    q: `${query} film complet`,
                    type: 'video',
                    maxResults: limit,
                    key: YT_API_KEY,
                    relevanceLanguage: 'fr',
                    videoEmbeddable: 'true'
                },
                timeout: 10000
            });
            return resp.data.items.map(item => ({
                id: `yt:${item.id.videoId}`,
                type: 'movie',
                name: item.snippet.title,
                description: item.snippet.description,
                poster: item.snippet.thumbnails?.high?.url,
                posterShape: 'landscape'
            }));
        } catch (err) {
            console.error('[YouTube] Erreur API officielle :', err.message);
            // On continue vers le fallback Invidious
        }
    }

    // Fallback : instance Invidious publique (pas de clé requise)
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const resp = await axios.get(`${instance}/api/v1/search`, {
                params: { q: `${query} film complet`, type: 'video' },
                timeout: 8000
            });
            return resp.data.slice(0, limit).map(v => ({
                id: `yt:${v.videoId}`,
                type: 'movie',
                name: v.title,
                description: v.description || '',
                poster: v.videoThumbnails?.[0]?.url,
                posterShape: 'landscape'
            }));
        } catch (err) {
            console.error(`[YouTube] Invidious ${instance} indisponible :`, err.message);
            // On essaie l'instance suivante
        }
    }

    return [];
}

/**
 * Retourne le lien de streaming YouTube pour un ID vidéo.
 * @param {string} videoId - L'ID YouTube
 * @returns {Promise<Array>} Liste de streams au format Stremio
 */
async function getStreams(videoId) {
    return [{
        title: 'YouTube',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        ytId: videoId,
        behaviorHints: {
            notWebReady: false
        }
    }];
}

module.exports = { searchVideos, getStreams };
