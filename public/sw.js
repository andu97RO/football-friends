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
  // Drop the previous deploy's copy of the shell bundles every page loads (runtime, common, entry, CSS).
  // Route chunks load later as screens open and several routes share a name such as "[id]", so they are
  // never evicted here; bumping VERSION clears them.
  const keep = new Set(wanted);
  const current = new Set(wanted.map((href) => shellChunk(new URL(href).pathname)).filter(Boolean));
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    const name = shellChunk(pathname);
    if (name && current.has(name) && !keep.has(request.url)) await cache.delete(request);
  }
}

// "/_expo/static/js/web/entry-770b…08.js" -> "js/entry"; null for route chunks.
function shellChunk(pathname) {
  const match = pathname.match(/^\/_expo\/static\/(js|css)\/(?:web\/)?(__expo-metro-runtime|__common|entry|[^/]+(?=-[0-9a-f]{16,}\.css$))-[0-9a-f]{16,}\.(js|css)$/);
  return match ? `${match[1]}/${match[2]}` : null;
}
