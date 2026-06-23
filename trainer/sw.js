/* ============================================================
   Service Worker — Private Gym PWA (v14)
   Стратегия network-first для ВСЕХ своих файлов
   (всегда отдаёт свежую версию из сети, кэш только для офлайн)
   ============================================================ */
const APP_CACHE = 'pg-app-v14';
const MEDIA_CACHE = 'pg-media-v2';

const PRECACHE = [
  '.',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './video-call.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch((err) => { console.warn('[SW] precache failed', err); })
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

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Firebase, Google,PeerJS CDN — только сеть
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('apis.google.com') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('meet.jit.si')
  ) {
    return;
  }

  // фото упражнений с GitHub, шрифты — cache-first (они большие и не меняются)
  if (
    url.hostname === 'raw.githubusercontent.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.pathname.includes('gifs')
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

  // ВСЁ остальное со своего домена — NETWORK-FIRST (свежая версия!)
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // обновляем кэш свежим файлом
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          // нет сети — отдаём кэш (или index.html как fallback)
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }
});
