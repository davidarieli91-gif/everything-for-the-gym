/* ============================================================
   Service Worker — Private Gym PWA
   Кэширует приложение для офлайн-работы в зале.
   Стратегии:
   - index.html: network-first (свежая версия при наличии сети,
     кэш как запасной вариант офлайн)
   - иконки/манифест: cache-first
   - фото упражнений (raw.githubusercontent) и шрифты: cache-first
     с докачкой (растущий кэш)
   - Firebase/Google API: всегда сеть (не кэшируем)
   ============================================================ */
const APP_CACHE = 'pg-app-v10';
const MEDIA_CACHE = 'pg-media-v1';

const PRECACHE = [
  './',
  './index.html',
  './15.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './video-call.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {}) // не валим установку, если что-то не докачалось
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== MEDIA_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* сообщение от страницы: применить обновление немедленно */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Firebase, Google авторизация, аналитика — только сеть */
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('apis.google.com')
  ) {
    return; // браузер сам сходит в сеть
  }

  /* навигация / index.html: network-first */
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/' ) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((r) => r || caches.match('./'))
        )
    );
    return;
  }

  /* фото упражнений с GitHub CDN, gstatic-шрифты, гифки: cache-first */
  if (
    url.hostname === 'raw.githubusercontent.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.pathname.startsWith('/gifs/') ||
    url.pathname.includes('/gifs/')
  ) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(MEDIA_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  /* остальное со своего домена: cache-first с обновлением */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
