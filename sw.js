const CACHE_NAME = 'study-forge-v0.6.57';
const ASSETS = [
    './',
    './index.html',
    './loader-lab.html',
    './styles.css',
    './script.js',
    './syllabus.js',
    './StudyForge_ADGIPS_BTech_IT_Guide_4p.pdf',
    './manifest.json',
    './logo.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/maskable-512.png',
    './icons/apple-180.png'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Network-first: always try the server, fall back to cache only offline.
// This makes every deploy land on next reload — no more stuck Saturday.
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request)
            .then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});
