// Bump this with each release so an installed app cannot remain on old hashed assets.
const CACHE_VERSION = 'talentisos-shell-v8'
const BUILD_MANIFEST = './asset-manifest.json'
const CONNECTION_PROBE_PARAM = 'talentisos-connection-check'
const SHELL_ASSETS = ['./', './index.html', BUILD_MANIFEST, './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png']

function isViteDevelopmentRequest(url) {
  return url.pathname.startsWith('/src/')
    || url.pathname.startsWith('/@vite/')
    || url.pathname.startsWith('/@id/')
    || url.pathname.startsWith('/node_modules/.vite/')
}

async function cacheProductionShell() {
  const cache = await caches.open(CACHE_VERSION)
  const manifestResponse = await fetch(BUILD_MANIFEST, { cache: 'no-cache' })
  if (!manifestResponse.ok) throw new Error('The production asset manifest could not be loaded.')
  const manifest = await manifestResponse.json()
  const entryAssets = Object.values(manifest)
    .filter((entry) => entry.isEntry)
    .flatMap((entry) => [entry.file, ...(entry.css || [])])
    .map((asset) => `./${asset}`)
  await cache.addAll([...SHELL_ASSETS, ...entryAssets])
}

function revalidateShell(request) {
  return fetch(request).then((response) => {
    if (!response.ok) return undefined
    const copy = response.clone()
    return caches.open(CACHE_VERSION).then((cache) => cache.put('./', copy))
  }).catch(() => undefined)
}

self.addEventListener('install', (event) => event.waitUntil(cacheProductionShell().then(() => self.skipWaiting())))
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('talentisos-shell-') && key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim())))
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.searchParams.has(CONNECTION_PROBE_PARAM)) {
    event.respondWith(fetch(event.request))
    return
  }
  if (isViteDevelopmentRequest(url)) {
    event.respondWith(fetch(event.request))
    return
  }
  if (event.request.mode === 'navigate') {
    const shell = caches.open(CACHE_VERSION).then((cache) => cache.match('./'))
    event.respondWith(shell.then((cached) => cached || fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE_VERSION).then((cache) => cache.put('./', copy)); return response }).catch(() => caches.match('./index.html'))))
    event.waitUntil(shell.then((cached) => cached ? revalidateShell(event.request) : undefined))
    return
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, response.clone())); return response })))
})
