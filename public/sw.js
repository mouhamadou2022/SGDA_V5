// SGDA V5 — Service Worker
// Cache les pages visitées + assets pour navigation offline

const CACHE = 'sgda-v5-v1'
const STATIC_ASSETS = ['/']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim())
})

function isCacheable(request) {
  return request.method === 'GET' && /^https?:$/.test(new URL(request.url).protocol)
}

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Ignorer les requêtes non cacheables (POST, chrome-extension, etc.)
  if (!isCacheable(request)) return

  // API calls — réseau uniquement, pas de cache
  if (url.pathname.startsWith('/api/')) return

  // Assets Next.js (_next/) — cache-first
  if (url.pathname.startsWith('/_next/')) {
    e.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const clone = res.clone()
        caches.open(CACHE).then((c) => c.put(request, clone))
        return res
      }))
    )
    return
  }

  // Navigation pages — network-first, fallback cache
  e.respondWith(
    fetch(request).then((res) => {
      const clone = res.clone()
      caches.open(CACHE).then((c) => c.put(request, clone))
      return res
    }).catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  )
})
