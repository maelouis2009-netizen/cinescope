// server.js
// Point d'entrée de l'addon CineScope.
// Gère : catalogues, recherche, métadonnées, saisons/épisodes, streams.

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const config = require('./config');
const archive = require('./sources/archive');
const youtube = require('./sources/youtube');

// ─────────────────────────────────────────────────────────────
// 1. MANIFESTE : la "carte d'identité" de l'addon
// ─────────────────────────────────────────────────────────────
const manifest = {
    id: 'org.cinescope.addon',
    version: '1.0.0',
    name: config.addonName,
    description: 'CineScope — Films et séries en français, métadonnées TMDB, sources légales (Internet Archive, YouTube).',
    logo: 'https://raw.githubusercontent.com/TON_COMPTE/cinescope/main/assets/logo.png', // ← à remplacer après le déploiement
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:', 'archive:', 'yt:'],
    catalogs: [
        { type: 'movie', id: 'cinescope_popular', name: 'CineScope — Films populaires', extra: [{ name: 'search', isRequired: false }, { name: 'skip' }] },
        { type: 'movie', id: 'cinescope_recent', name: 'CineScope — Films récents', extra: [{ name: 'skip' }] },
        { type: 'movie', id: 'cinescope_archive', name: 'CineScope — Domaine public', extra: [{ name: 'search', isRequired: false }] },
        { type: 'series', id: 'cinescope_series', name: 'CineScope — Séries populaires', extra: [{ name: 'search', isRequired: false }, { name: 'skip' }] }
    ],
    behaviorHints: {
        configurable: false
    }
};

const builder = new addonBuilder(manifest);

// ─────────────────────────────────────────────────────────────
// 2. UTILITAIRES TMDB
// ─────────────────────────────────────────────────────────────
const tmdb = axios.create({
    baseURL: config.tmdbBaseUrl,
    params: { api_key: config.tmdbApiKey, language: config.language },
    timeout: 10000
});

/** Convertit un résultat TMDB en "meta" Stremio. */
function tmdbToMeta(item, type) {
    return {
        id: `tmdb:${item.id}`,
        type: type,
        name: item.title || item.name,
        poster: item.poster_path ? `${config.tmdbImageBase}/w500${item.poster_path}` : undefined,
        background: item.backdrop_path ? `${config.tmdbImageBase}/original${item.backdrop_path}` : undefined,
        description: item.overview,
        year: (item.release_date || item.first_air_date || '').substring(0, 4),
        imdbRating: item.vote_average ? item.vote_average.toFixed(1) : undefined,
        posterShape: 'poster'
    };
}

// ─────────────────────────────────────────────────────────────
// 3. GESTIONNAIRE DE CATALOGUE
// ─────────────────────────────────────────────────────────────
builder.defineCatalogHandler(async (args) => {
    const { type, id, extra } = args;
    console.log('[Catalog]', { type, id, extra });

    const skip = extra?.skip || 0;
    const search = extra?.search;

    try {
        // ─── Catalogue Archive (domaine public) ───
        if (id === 'cinescope_archive') {
            const q = search || 'classic film';
            return { metas: await archive.searchMovies(q) };
        }

        // ─── Recherche globale (films ou séries) ───
        if (search) {
            const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
            const resp = await tmdb.get(endpoint, { params: { query: search, page: 1 } });
            return { metas: resp.data.results.map(r => tmdbToMeta(r, type)) };
        }

        // ─── Films populaires ───
        if (id === 'cinescope_popular') {
            const resp = await tmdb.get('movie/popular', { params: { page: Math.floor(skip / 20) + 1 } });
            return { metas: resp.data.results.map(r => tmdbToMeta(r, 'movie')) };
        }

        // ─── Films récents ───
        if (id === 'cinescope_recent') {
            const resp = await tmdb.get('movie/now_playing', { params: { page: 1 } });
            return { metas: resp.data.results.map(r => tmdbToMeta(r, 'movie')) };
        }

        // ─── Séries populaires ───
        if (id === 'cinescope_series') {
            const resp = await tmdb.get('tv/popular', { params: { page: Math.floor(skip / 20) + 1 } });
            return { metas: resp.data.results.map(r => tmdbToMeta(r, 'series')) };
        }

        return { metas: [] };
    } catch (err) {
        console.error('[Catalog] Erreur :', err.message);
        return { metas: [] };
    }
});

// ─────────────────────────────────────────────────────────────
// 4. GESTIONNAIRE DE MÉTADONNÉES
// ─────────────────────────────────────────────────────────────
builder.defineMetaHandler(async (args) => {
    const { type, id } = args;
    console.log('[Meta]', { type, id });

    // ─── IDs TMDB ou IMDB → métadonnées TMDB ───
    if (id.startsWith('tmdb:') || id.startsWith('tt')) {
        let tmdbId = id.startsWith('tmdb:') ? id.replace('tmdb:', '') : null;

        // Convertir IMDB → TMDB
        if (!tmdbId && id.startsWith('tt')) {
            try {
                const find = await tmdb.get(`find/${id}`, { params: { external_source: 'imdb_id' } });
                const results = type === 'movie' ? find.data.movie_results : find.data.tv_results;
                if (results.length === 0) return { meta: null };
                tmdbId = results[0].id;
            } catch (err) {
                console.error('[Meta] Erreur find IMDB :', err.message);
                return { meta: null };
            }
        }

        try {
            // Détails de base
            const endpoint = type === 'movie' ? `movie/${tmdbId}` : `tv/${tmdbId}`;
            const details = await tmdb.get(endpoint, {
                params: { append_to_response: 'credits,videos,external_ids' }
            });
            const d = details.data;

            const meta = {
                id: id,
                type: type,
                name: d.title || d.name,
                poster: d.poster_path ? `${config.tmdbImageBase}/w500${d.poster_path}` : undefined,
                background: d.backdrop_path ? `${config.tmdbImageBase}/original${d.backdrop_path}` : undefined,
                description: d.overview,
                year: (d.release_date || d.first_air_date || '').substring(0, 4),
                imdbRating: d.vote_average ? d.vote_average.toFixed(1) : undefined,
                genres: d.genres?.map(g => g.name),
                cast: d.credits?.cast?.slice(0, 10).map(c => c.name),
                director: d.credits?.crew?.filter(c => c.job === 'Director').map(c => c.name),
                runtime: d.runtime ? `${d.runtime} min` : (d.episode_run_time?.[0] ? `${d.episode_run_time[0]} min` : undefined)
            };

            // ─── Séries : ajouter les saisons/épisodes ───
            if (type === 'series') {
                const seasons = d.seasons?.filter(s => s.season_number > 0) || [];
                meta.videos = [];
                for (const season of seasons) {
                    try {
                        const seasonResp = await tmdb.get(`tv/${tmdbId}/season/${season.season_number}`);
                        for (const ep of seasonResp.data.episodes) {
                            meta.videos.push({
                                id: `tmdb:${tmdbId}:${season.season_number}:${ep.episode_number}`,
                                title: ep.name,
                                season: season.season_number,
                                episode: ep.episode_number,
                                released: ep.air_date ? new Date(ep.air_date).toISOString() : undefined,
                                overview: ep.overview,
                                thumbnail: ep.still_path ? `${config.tmdbImageBase}/w300${ep.still_path}` : undefined
                            });
                        }
                    } catch (e) {
                        console.error(`[Meta] Erreur saison ${season.season_number} :`, e.message);
                    }
                }
            }

            return { meta };
        } catch (err) {
            console.error('[Meta] Erreur détails :', err.message);
            return { meta: null };
        }
    }

    // ─── IDs Archive ───
    if (id.startsWith('archive:')) {
        const identifier = id.replace('archive:', '');
        return {
            meta: {
                id,
                type: 'movie',
                name: `Film Archive.org (${identifier})`,
                poster: `https://archive.org/services/img/${identifier}`,
                description: 'Métadonnées disponibles sur Internet Archive.',
                posterShape: 'poster'
            }
        };
    }

    // ─── IDs YouTube ───
    if (id.startsWith('yt:')) {
        const videoId = id.replace('yt:', '');
        return {
            meta: {
                id,
                type: 'movie',
                name: `Vidéo YouTube (${videoId})`,
                poster: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                description: 'Vidéo YouTube.',
                posterShape: 'landscape'
            }
        };
    }

    return { meta: null };
});

// ─────────────────────────────────────────────────────────────
// 5. GESTIONNAIRE DE STREAMS
// ─────────────────────────────────────────────────────────────
builder.defineStreamHandler(async (args) => {
    const { type, id } = args;
    console.log('[Stream]', { type, id });

    let streams = [];

    // ─── Streams Internet Archive ───
    if (id.startsWith('archive:')) {
        const identifier = id.replace('archive:', '');
        streams = await archive.getStreams(identifier);
    }

    // ─── Streams YouTube ───
    if (id.startsWith('yt:')) {
        const videoId = id.replace('yt:', '');
        streams = await youtube.getStreams(videoId);
    }

    // ─── Pour les IDs TMDB/IMDB, on cherche des sources légales ───
    // On peut par exemple chercher le film sur Internet Archive (domaine public)
    if (id.startsWith('tmdb:') || id.startsWith('tt')) {
        try {
            // On récupère le titre pour chercher sur Archive
            const metaResp = await builder.getInterface().get('meta', type, id);
            const title = metaResp?.meta?.name;
            if (title) {
                const archiveResults = await archive.searchMovies(title, 5);
                for (const item of archiveResults) {
                    const archiveStreams = await archive.getStreams(item.id.replace('archive:', ''));
                    streams = streams.concat(archiveStreams);
                }
            }
        } catch (e) {
            console.error('[Stream] Erreur recherche Archive pour TMDB :', e.message);
        }
    }

    return { streams };
});

// ─────────────────────────────────────────────────────────────
// 6. DÉMARRAGE DU SERVEUR
// ─────────────────────────────────────────────────────────────
const iface = builder.getInterface();
serveHTTP(iface, { port: config.port, hostname: '0.0.0.0' }).then(server => {
    console.log(`✅ CineScope démarré sur : ${server.url}/manifest.json`);
    console.log(`👉 Colle cette URL dans Nuvio sur ta TV TCL.`);
});
