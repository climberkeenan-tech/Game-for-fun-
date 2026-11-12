// Mitt Rush service worker: keeps the game playable offline once it has loaded.
//
// Game code and pages: network first, so changes show up as soon as you are
// online, with the cached copy used when offline or when the network stalls.
// A page that loaded from the cache gets the rest of its files from the cache
// too, so one launch never mixes old and new code.
// Tracking runtime, pose model and fonts: cache first. They never change at the
// same URL, so bump ASSET_CACHE if anything in vendor/ or models/ is replaced.

const SHELL_CACHE = 'mittrush-shell-v1';
const ASSET_CACHE = 'mittrush-assets-v1';
const FONT_CACHE = 'mittrush-fonts-v1';
const NETWORK_TIMEOUT = 4000;

const SCOPE = new URL(self.registration.scope);
const at = (path) => new URL(path, SCOPE).href;

const SHELL = [
  './',
  'css/style.css',
  'js/main.js',
  'js/game.js',
  'js/body.js',
  'js/tracker.js',
  'js/config.js',
  'js/sfx.js',
  'js/coach.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
].map(at);

// The SIMD build covers every current browser, and the full pose model is the
// one the game starts with. The fallback build and the lite model are cached on
// first use if a device ever needs them.
const ASSETS = [
  'vendor/mediapipe/vision_bundle.mjs',
  'vendor/mediapipe/wasm/vision_wasm_internal.js',
  'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  'models/pose_landmarker_full.task',
].map(at);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // An update (an older Mitt Rush worker already cached the runtime) must get
      // every file, or it fails and the working version stays in charge. A first
      // install is best effort: anything missed is cached when the game loads it.
      const update = (await caches.keys()).some((k) => k.startsWith('mittrush-assets-'));
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL);
      const assets = await caches.open(ASSET_CACHE);
      await Promise.all(
        ASSETS.map(async (url) => {
          if (await assets.match(url)) return;
          try {
            await assets.add(url);
          } catch (e) {
            if (update) throw e;
          }
        }),
      );
      await cacheFonts(shell);
      await self.skipWaiting();
    })(),
  );
});

// The page's first visit happens before this worker controls it, so its font
// downloads are never seen here. Fetch the same stylesheet (the URL is read from
// the cached page) plus the font files it points to, so offline play keeps the type.
async function cacheFonts(shell) {
  try {
    const page = await shell.match(at('./'));
    if (!page) return;
    const html = await page.text();
    const m = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/);
    if (!m) return;
    const cssUrl = m[1].replace(/&amp;/g, '&');
    const fonts = await caches.open(FONT_CACHE);
    const res = await fetch(cssUrl, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return;
    const css = await res.clone().text();
    await fonts.put(cssUrl, res);
    const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)'"\s]+)\)/g)].map((x) => x[1]);
    await Promise.all(
      files.map(async (url) => {
        if (await fonts.match(url)) return;
        try {
          const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
          if (r.ok) await fonts.put(url, r);
        } catch (e) {
          /* cached later at runtime */
        }
      }),
    );
  } catch (e) {
    /* fonts are cosmetic: offline play falls back to system fonts */
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith('mittrush-') && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// Pages (window ids) that were served from the cache during this worker's life.
const fromCache = new Set();

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === SCOPE.origin) {
    if (!url.pathname.startsWith(SCOPE.pathname)) return;
    const rel = url.pathname.slice(SCOPE.pathname.length);
    if (rel.startsWith('vendor/') || rel.startsWith('models/')) {
      event.respondWith(cacheFirst(event, ASSET_CACHE, url.origin + url.pathname));
      return;
    }
    if (req.mode === 'navigate') {
      // Every page in scope is the same single-page app, whatever its query string.
      const id = event.resultingClientId;
      event.respondWith(networkFirst(event, at('./'), NETWORK_TIMEOUT, () => id && fromCache.add(id)));
      return;
    }
    const key = url.origin + url.pathname;
    if (fromCache.has(event.clientId)) event.respondWith(cacheElseNetwork(event, key));
    else event.respondWith(networkFirst(event, key, 0));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event, FONT_CACHE, req.url));
  }
});

// Serve from the cache, or fetch and store a copy without holding up the response.
async function cacheFirst(event, cacheName, key) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
    const copy = res.clone();
    event.waitUntil(cache.put(key, copy).catch(() => {}));
  }
  return res;
}

async function cacheElseNetwork(event, key) {
  const cache = await caches.open(SHELL_CACHE);
  return (await cache.match(key, { ignoreSearch: true })) || fetch(event.request);
}

// timeout 0 waits for the network as long as it takes and only falls back to the
// cache when the request fails outright.
function networkFirst(event, key, timeout, onCached) {
  let storing = Promise.resolve();
  const network = fetch(event.request).then((res) => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      storing = caches
        .open(SHELL_CACHE)
        .then((cache) => cache.put(key, copy))
        .catch(() => {});
    }
    return res;
  });
  // Keep the worker alive until the cache update finishes, even when the cached
  // copy wins the race below.
  event.waitUntil(network.then(() => storing, () => {}));

  return (async () => {
    let timer;
    const racers = [network];
    if (timeout) {
      racers.push(
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeout);
        }),
      );
    }
    try {
      return await Promise.race(racers);
    } catch (err) {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) {
        if (onCached) onCached();
        return hit;
      }
      return network; // nothing cached: keep waiting for the network (or its error)
    } finally {
      clearTimeout(timer);
    }
  })();
}
