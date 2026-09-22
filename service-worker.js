const CACHE_NAME = 'gymtracker-v3';
const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'styles.css',
  'app.js',
  'db.js',
  'ui.js',
  'timer.js',
  'timer-ui.js',
  'theme.js',
  'import.js',
  'workout-data.js',
  'daily-data.js',
  'dashboard-data.js',
  'blocks-data.js',
  'chart.js',
  'export.js',
  'program.js',
  'seed-logged.js',
  'today.js',
  'workout.js',
  'checkin.js',
  'dashboard.js',
  'plan.js',
  'minixlsx.js',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
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
