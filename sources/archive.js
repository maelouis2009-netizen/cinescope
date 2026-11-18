// sources/archive.js
// Recherche de films du domaine public sur Internet Archive.
// 100% légal, 100% gratuit, très stable.

const axios = require('axios');

const ARCHIVE_SEARCH_URL = 'https://archive.org/advancedsearch.php';
const ARCHIVE_DOWNLOAD_URL = 'https://archive.org/download';

/**
 * Recherche des films sur Internet Archive.
 * @param {string} query - Le texte recherché (titre, mot-clé…)
 * @param {number} limit - Nombre max de résultats
 * @returns {Promise<Array>} Liste de films au format "meta" Stremio
 */
async function searchMovies(query, limit = 20) {
    try {
        const response = await axios.get(ARCHIVE_SEARCH_URL, {
            params: {
                q: `collection:(moviesandfilms) AND mediatype:(movies) AND title:(${query})`,
                fl: ['identifier', 'title', 'description', 'year', 'creator'],
                rows: limit,
                output: 'json'
            },
            timeout: 10000
        });

        const docs = response.data?.response?.docs || [];
        return docs.map(doc => ({
            id: `archive:${doc.identifier}`,
            type: 'movie',
            name: doc.title || 'Titre inconnu',
            description: doc.description || 'Pas de description disponible.',
            year: doc.year ? parseInt(doc.year, 10) : undefined,
            poster: `https://archive.org/services/img/${doc.identifier}`,
            posterShape: 'poster'
        }));
    } catch (err) {
        console.error('[Archive] Erreur recherche :', err.message);
        return [];
    }
}

/**
 * Retourne les liens de streaming d'un film Archive.
 * @param {string} identifier - L'identifiant Archive du film
 * @returns {Promise<Array>} Liste de streams au format Stremio
 */
async function getStreams(identifier) {
    try {
        // On interroge les métadonnées du fichier pour trouver le vrai nom du fichier vidéo
        const metaResp = await axios.get(`https://archive.org/metadata/${identifier}`, {
            timeout: 10000
        });
        const files = metaResp.data?.files || [];

        // On cherche les fichiers vidéo (mp4 en priorité, puis autres formats)
        const videoFiles = files.filter(f =>
            f.name && /\.(mp4|m4v|webm|ogv)$/i.test(f.name)
        );

        // On privilégie les MP4 (compatibles avec tous les lecteurs)
        videoFiles.sort((a, b) => {
            const aIsMp4 = /\.mp4$/i.test(a.name) ? 1 : 0;
            const bIsMp4 = /\.mp4$/i.test(b.name) ? 1 : 0;
            return bIsMp4 - aIsMp4;
        });

        return videoFiles.map(file => ({
            title: `Archive.org — ${file.name}`,
            url: `${ARCHIVE_DOWNLOAD_URL}/${identifier}/${encodeURIComponent(file.name)}`,
            behaviorHints: {
                notWebReady: false
            }
        }));
    } catch (err) {
        console.error('[Archive] Erreur streams :', err.message);
        return [];
    }
}

module.exports = { searchMovies, getStreams };
