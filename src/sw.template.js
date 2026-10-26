// Service worker template: vite.config.ts fills in the cache version and the list of built files.
const CACHE = 'pdf-studio-__CACHE_VERSION__'
const PRECACHE = __PRECACHE__

// Static files are matched by URL alone: a server's `Vary: Origin` would otherwise make module scripts miss the cache.
const MATCH_OPTIONS = { ignoreVary: true }

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.registration.scope).href)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  // Pages: try the network so a new deploy shows up, and fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(new URL('./', self.registration.scope).href, MATCH_OPTIONS).then((cached) => cached ?? Response.error()),
      ),
    )
    return
  }

  // Everything else is hashed or versioned, so the cached copy is safe to serve first.
  event.respondWith(
    caches.match(request, MATCH_OPTIONS).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
