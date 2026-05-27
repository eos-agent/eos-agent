// ═══════════════════════════════════════════════════
// EOS AGENT — Service Worker v1.0
// Estrategia: Cache-first para assets, network-first para API calls
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'eos-agent-v1';
const CORE_ASSETS = [
  '/',
  '/index.html'
];

// ── Install: cache core assets ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch: cache-first for same-origin, network-first for APIs ──
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip external APIs (Claude, ElevenLabs, Spotify, etc.)
  if (url.origin !== self.location.origin) return;

  // For same-origin requests: try cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      var networkFetch = fetch(event.request).then(function(response) {
        // Cache fresh responses
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
      // Return cached immediately if available, else wait for network
      return cached || networkFetch;
    }).catch(function() {
      // Full offline fallback: return cached index.html
      return caches.match('/index.html');
    })
  );
});

// ── Message: force update ──
self.addEventListener('message', function(event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
