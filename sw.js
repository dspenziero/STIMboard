/* ==========================================================================
   STIMboard Service Worker (sw.js)
   --------------------------------------------------------------------------
   ROLE OF THIS FILE
   A service worker is a script the browser runs in the BACKGROUND, separate
   from the page. It sits between the app and the network and can answer
   requests itself. That is what makes STIMboard work offline and installable.

   STRATEGY: NETWORK-FIRST
     1. Try the network. If it works, hand the fresh file to the page AND save
        a copy in the cache.
     2. If the network fails (offline), serve the last saved copy instead.
   Compared to "cache-first", this means updates show up immediately when the
   phone has signal, while the cache is only a safety net.

   NOTE: this file runs in a worker, not in the page. It has no 'window' or
   'document'; the global object is called 'self'.
   ========================================================================== */

// The name of our cache bucket in Cache Storage. BUMP THIS NUMBER whenever you
// ship changes (v9 -> v10 ...). Changing sw.js's bytes is what makes the
// browser notice a new worker exists and install it.
const CACHE_NAME = 'stimboard-modular-v9';

// 'install' fires once when this version of the worker is first downloaded.
self.addEventListener('install', (e) => {
  // Normally a new worker WAITS until every tab using the old one is closed.
  // skipWaiting() says "don't wait, activate right now".
  self.skipWaiting();
});

// 'activate' fires when this worker becomes the active one.
self.addEventListener('activate', (e) => {
  // clients.claim() makes the worker take control of already-open pages
  // immediately (instead of only pages opened afterwards). waitUntil() keeps
  // the worker alive until that promise finishes. app.js listens for the
  // resulting 'controllerchange' and reloads the page once.
  e.waitUntil(self.clients.claim());
});

// 'fetch' fires for EVERY request the page makes (html, css, js, audio, images).
self.addEventListener('fetch', (e) => {
  // respondWith() lets us supply the response ourselves.
  e.respondWith(
    // STEP 1: always try the network first.
    fetch(e.request)
      .then((networkResponse) => {
        // Only cache good responses. Status 200 = OK; this skips 404s (e.g. a
        // missing .m4a), so app.js still sees the failure and can use the synth fallback.
        if (networkResponse && networkResponse.status === 200) {
          // A response body can only be read ONCE. We need one copy for the
          // page and one for the cache, so clone it.
          const responseToCache = networkResponse.clone();
          // Open our cache bucket and store the copy under this request.
          // (Not awaited: the page gets its response without waiting for the save.)
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        // Give the fresh response to the page.
        return networkResponse;
      })
      // STEP 2: the network request failed entirely (offline, DNS error...).
      // Look for a saved copy of this exact request. If none exists this
      // resolves to undefined and the browser shows its normal error.
      .catch(() => caches.match(e.request))
  );
});