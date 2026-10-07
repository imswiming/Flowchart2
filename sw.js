// Service worker: keeps the app's own files on the device so repeat visits
// start from local storage instead of re-downloading them (the 2 MB note
// editor above all), and so the app can open without a connection.
//
// - d3 and the note editor never change for a given file, so they're served
//   straight from the cache (bump CACHE_NAME below if they're ever replaced).
// - index.html, script.js and style.css are served from the cache instantly
//   too, but re-checked with the server in the background each time (always
//   revalidated - GitHub Pages lets browsers reuse a file for 10 minutes, which
//   used to make this "refresh" just fetch the same stale copy again) and the
//   cache updated. When a file really changed, open pages are told so they can
//   offer a reload (see index.html).
// Only this site's own files are touched - cloud sync calls and anything else
// go straight to the network.

const CACHE_NAME = 'flowchart-v3';

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

const notifyClients = async (message, navigate) => {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => {
        if (navigate && c.navigate) c.navigate(c.url).catch(() => {});
        else c.postMessage(message);
    });
};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // 'reload' skips the browser's own HTTP cache so a new version is
            // installed from the server, not from whatever the browser kept.
            .then(cache => cache.addAll([...IMMUTABLE, ...REFRESHED].map(path => new Request(path, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        const old = keys.filter(k => k !== CACHE_NAME);
        await Promise.all(old.map(k => caches.delete(k)));
        await self.clients.claim();
        // Upgrading from an earlier version of this worker: pages already open
        // are still running the old cached files (and can't be told about the
        // update), so reload them once onto the fresh ones.
        if (old.length) await notifyClients(null, true);
    })());
});

const isImmutable = (url) => IMMUTABLE.some(path => url.pathname.endsWith('/' + path) || url.pathname === '/' + path);

const versionOf = (res) => (res && (res.headers.get('etag') || res.headers.get('last-modified'))) || '';

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
            const refresh = fetch(req.url, { cache: 'no-cache' }).then((res) => {
                if (res && res.ok) {
                    const changed = hit && versionOf(hit) && versionOf(res) && versionOf(hit) !== versionOf(res);
                    cache.put(req, res.clone());
                    if (changed) notifyClients({ type: 'app-updated' });
                }
                return res;
            }).catch(() => hit);
            // Keep the worker alive until the background refresh finishes.
            event.waitUntil(refresh);
            return hit || refresh;
        })
    );
});
