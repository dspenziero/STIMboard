/* ==========================================================================
   STIMboard Service Worker (sw.js)
   --------------------------------------------------------------------------
   GOALS: (1) works fully OFFLINE, (2) a pushed update shows up IMMEDIATELY.

   HOW:
   - INSTALL: precache the whole app shell + every audio file, so the very
     first visit already makes offline mode work.
   - FETCH: NETWORK-FIRST with the HTTP cache bypassed (cache: 'no-cache'),
     so online you always get the newest file from GitHub Pages. Each good
     response refreshes the saved copy. Offline -> serve the saved copy.
   - ACTIVATE: delete every cache from older versions and take control of open
     pages at once (app.js reloads the page once on 'controllerchange').
   - RANGE REQUESTS: <audio> asks for byte ranges; cached full responses are
     sliced into proper 206 replies so offline audio works on every browser.

   TO SHIP AN UPDATE: bump CACHE_NAME (and the ?v= numbers in index.html).
   ========================================================================== */

const CACHE_NAME = 'stimboard-modular-v24';

// Files saved at install time. Missing files (e.g. an audio file not uploaded
// yet) are skipped individually so one 404 can never break the install.
const PRECACHE = [
  './', './index.html', './styles.css', './log.js', './data.js', './synth.js', './extras.js', './app.js',
  './manifest.json', './stims.json', './icon-192-v2.png', './icon-512-v2.png', './icon-maskable-192.png', './icon-maskable-512.png',
  './case.m4a', './bday1.m4a', './bday2.m4a', './the-trumpet.m4a', './trumpet.m4a',
  './barney-gumbled.m4a', './fuckwitme-bich.m4a', './fuckwit-chu.m4a',
  './follow-rules.m4a', './dirty-south.m4a', './rocknstone.m4a', './rock-on.m4a',
  './we-fight-rocknstone.m4a', './2the-bone.m4a', './rocknstone-diff.m4a',
  './never-alone.m4a', './rocknstone-home.m4a', './hear-rocknstone.m4a'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Activate immediately; do not wait for old tabs to close.
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE.map((url) =>
        // 'reload' skips the HTTP cache so we never precache a stale copy.
        fetch(new Request(url, { cache: 'reload' }))
          .then((res) => { if (res && res.status === 200) return cache.put(url, res); })
          .catch(() => {})
      ))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Builds a 206 Partial Content reply from a cached full response.
async function rangeResponse(request, cached) {
  const range = request.headers.get('range');
  if (!range || !cached) return cached;
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m && m[1] ? parseInt(m[1], 10) : 0;
  const end = m && m[2] ? Math.min(parseInt(m[2], 10), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mp4',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1)
    }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                              // Only cache GETs.
  if (new URL(req.url).origin !== self.location.origin) return;  // Ignore other sites.

  e.respondWith((async () => {
    try {
      // Always ask the network, bypassing the browser's HTTP cache.
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.status === 200) {
        const copy = res.clone();
        // Store under the plain path (no ?v=) so offline lookups always match.
        const key = new URL(req.url); key.search = '';
        e.waitUntil(caches.open(CACHE_NAME).then((c) => c.put(key.href, copy)));
      }
      return res;
    } catch (err) {
      // OFFLINE: serve the saved copy (ignoring ?v=). Navigations get index.html.
      const key = new URL(req.url); key.search = '';
      let cached = await caches.match(key.href);
      if (!cached && req.mode === 'navigate') cached = await caches.match('./index.html');
      return (await rangeResponse(req, cached)) || Response.error();
    }
  })());
});
