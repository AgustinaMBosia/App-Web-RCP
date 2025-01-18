const CACHE_NAME = 'app-web-cache-v1';
const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js'
];

// Instalar Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Archivos en caché');
            return cache.addAll(FILES_TO_CACHE);
        })
    );
});

// Activar Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Eliminando caché antigua:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Interceptar solicitudes
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        }).catch(() => {
            return caches.match('/index.html');
        })
    );
});
