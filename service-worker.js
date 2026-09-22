const CACHE_NAME = 'gymtracker-v2';
const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/app.js',
  'js/db.js',
  'js/ui.js',
  'js/timer.js',
  'js/timer-ui.js',
  'js/theme.js',
  'js/import.js',
  'js/workout-data.js',
  'js/daily-data.js',
  'js/dashboard-data.js',
  'js/blocks-data.js',
  'js/chart.js',
  'js/export.js',
  'js/data/program.js',
  'js/data/seed-logged.js',
  'js/screens/today.js',
  'js/screens/workout.js',
  'js/screens/checkin.js',
  'js/screens/dashboard.js',
  'js/screens/plan.js',
  'js/vendor/minixlsx.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match('index.html'));
    })
  );
});
