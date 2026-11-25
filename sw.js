/* GG app service worker: keeps the app shell available and shows an offline page.
   Network-first everywhere so users always get the latest deploy when online.
   API calls, Netlify internals and cross-origin requests are never cached. */
const CACHE = 'gg-shell-20261125-modern';
const SHELL = ['/', '/app', '/offline.html', '/ios-native.js', '/manifest.webmanifest', '/favicon.svg?v=gg-logo-2', '/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

const skip = url => url.origin !== self.location.origin
  || url.pathname.startsWith('/api/')
  || url.pathname.startsWith('/.netlify/')
  || url.pathname.startsWith('/news-feeds/')
  || url.pathname.startsWith('/gg-')
  || url.pathname === '/sw.js';

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (skip(url)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('/offline.html')) || Response.error();
      return Response.error();
    }
  })());
});
