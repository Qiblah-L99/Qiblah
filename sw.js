// Qiblah Service Worker
// Strategy:
//   - App shell (HTML, kahf.js) → Cache First, fallback to network
//   - Supabase API calls       → Network First, no SW caching (handled by localStorage in app)
//   - Google Fonts / CDN       → Cache First with long TTL
//   - Everything else          → Network First

var CACHE_NAME = 'qiblah-shell-v3';

var SHELL_ASSETS = [
  '/',
  '/index.html',
  '/kahf.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Use individual adds so one failure doesn't block the rest
      return Promise.allSettled(
        SHELL_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('SW: could not cache', url, err);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch: route by request type ────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Skip non-GET and browser extension requests
  if (e.request.method !== 'GET') return;
  if (!url.startsWith('http')) return;

  // Supabase API — always network, never cache in SW
  // (app handles this via localStorage)
  if (url.includes('supabase.co')) return;

  // Google Fonts / CDN assets — cache first, long lived
  if (url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      url.includes('cdn.vercel-insights.com')) {
    e.respondWith(cacheFirst(e.request, 'qiblah-cdn-v1'));
    return;
  }

  // App shell — cache first, fall back to network
  if (isShellRequest(url)) {
    e.respondWith(cacheFirst(e.request, CACHE_NAME));
    return;
  }

  // Everything else — network first, fall back to cache
  e.respondWith(networkFirst(e.request));
});

function isShellRequest(url) {
  return SHELL_ASSETS.some(function(path) {
    return url.endsWith(path) || url.endsWith('/');
  }) || url.endsWith('.js') || url.endsWith('.css') ||
       url.endsWith('.png') || url.endsWith('.json');
}

// Cache first: serve from cache, update cache in background
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function(cache) {
    return cache.match(request).then(function(cached) {
      var networkFetch = fetch(request).then(function(response) {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function() { return cached; });

      return cached || networkFetch;
    });
  });
}

// Network first: try network, fall back to cache
function networkFirst(request) {
  return fetch(request).then(function(response) {
    if (response && response.status === 200) {
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(function() {
    return caches.match(request).then(function(cached) {
      return cached || caches.match('/index.html');
    });
  });
}

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', function(e) {
  if (!e.data) return;
  var data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Qiblah', {
      body:    data.body    || '',
      icon:    data.icon    || '/icons/icon-192.png',
      badge:   data.badge   || '/icons/icon-192.png',
      tag:     data.tag     || 'qiblah-notif',
      data:    data.url     || '/',
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(list) {
      var url = e.notification.data || '/';
      for (var i = 0; i < list.length; i++) {
        if (list[i].url === url && 'focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
