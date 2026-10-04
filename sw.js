// Service worker: keeps the app's own files on the device so repeat visits
// start from local storage instead of re-downloading them (the 2 MB note
// editor above all), and so the app can open without a connection.
//
// - d3 and the note editor never change for a given file, so they're served
//   straight from the cache (bump CACHE_NAME below if they're ever replaced).
// - index.html, script.js and style.css are served from the cache instantly
//   too, but re-fetched in the background each time and the cache refreshed,
//   so an update shows up the next time the page is opened.
// Only this site's own files are touched - cloud sync calls and anything else
// go straight to the network.

const CACHE_NAME = 'flowchart-v1';

const IMMUTABLE = [
    'd3.v7.min.js',
    'vendor/ckeditor5/ckeditor5.css',
    'vendor/ckeditor5/ckeditor5.umd.js',
];
const REFRESHED = [
    './',
    'index.html',
    'style.css',
    'script.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll([...IMMUTABLE, ...REFRESHED]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

const isImmutable = (url) => IMMUTABLE.some(path => url.pathname.endsWith('/' + path) || url.pathname === '/' + path);

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (isImmutable(url)) {
        event.respondWith(
            caches.match(req).then(hit => hit || fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copy));
                return res;
            }))
        );
        return;
    }

    const isPage = req.mode === 'navigate';
    const isAppFile = REFRESHED.some(path => path !== './' && url.pathname.endsWith('/' + path));
    if (!isPage && !isAppFile) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const hit = await cache.match(req, { ignoreSearch: true });
            const refresh = fetch(req).then((res) => {
                if (res && res.ok) cache.put(req, res.clone());
                return res;
            }).catch(() => hit);
            return hit || refresh;
        })
    );
});
