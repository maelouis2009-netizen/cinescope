// config.js
// ⚠️ Ce fichier contient ta clé API TMDB.
// Sur Render, tu utiliseras une variable d'environnement (voir Partie 4).
// En local, tu peux mettre ta clé directement ici pour tester.

module.exports = {
    // Clé API TMDB (v3). En prod, elle vient de process.env.TMDB_API_KEY
    tmdbApiKey: process.env.TMDB_API_KEY || '86e24b300d2dd56a36f7f36568e54a76',

    // Langue des métadonnées
    language: 'fr-FR',

    // URL de base TMDB
    tmdbBaseUrl: 'https://api.themoviedb.org/3',

    // URL de base pour les images TMDB
    tmdbImageBase: 'https://image.tmdb.org/t/p',

    // Nom de l'addon (affiché dans Nuvio)
    addonName: 'CineScope',

    // Port local (Render fournit son propre port via process.env.PORT)
    port: process.env.PORT || 7000
};