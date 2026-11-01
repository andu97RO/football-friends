// Football Friends service worker: keeps the app shell and the build's static files available offline.
// Only same-origin GET requests are handled. Supabase calls are cross-origin and always go straight to the network.
// Bump VERSION when files that are cached without a content hash (the icons below) change.
const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icons/icon-192.png'];
const NETWORK_TIMEOUT_MS = 4000;

// The Expo export hashes everything under these prefixes, so a cached copy never goes stale.
const isHashedAsset = (pathname) => pathname.startsWith('/_expo/static/') || pathname.startsWith('/assets/');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Static pages such as /privacy.html are not part of the app shell.
    if (url.pathname.endsWith('.html')) return;
    event.respondWith(shellResponse(request));
  } else if (isHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

// The first visit loads the bundle before this worker controls the page, so the page lists what it loaded.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheCurrentBuild(event.data.urls));
  }
});

// Every route renders the same index.html, so the latest copy is kept under "/".
async function shellResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put('/', response.clone());
    return response;
  });
  try {
    const cached = await cache.match('/');
    if (!cached) return await network;
    // Prefer fresh HTML, but open from the cache when the network is slow or down.
    return await Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS))]);
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function cacheCurrentBuild(urls) {
  const cache = await caches.open(STATIC_CACHE);
  const wanted = urls
    .map((value) => new URL(value, self.location.origin))
    .filter((url) => url.origin === self.location.origin && isHashedAsset(url.pathname))
    .map((url) => url.href);
  await Promise.all(wanted.map(async (href) => {
    if (!(await cache.match(href))) await cache.add(href).catch(() => undefined);
  }));
  // Bundles from earlier deploys are no longer referenced by index.html.
  const keep = new Set(wanted);
  for (const request of await cache.keys()) {
    if (new URL(request.url).pathname.startsWith('/_expo/static/') && !keep.has(request.url)) await cache.delete(request);
  }
}
