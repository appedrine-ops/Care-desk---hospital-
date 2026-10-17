// CareDesk service worker: keeps the app working offline.
const CACHE = 'caredesk-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for the app itself (so updates arrive), cache as fallback.
// Requests to other origins (for example Ollama) are never touched.
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});

// ---- Staff alerts (phone push) ----
// The server sends a small JSON message: { title, body, tag, url, urgent }.
// If CareDesk is open on screen the app shows its own alert, so we stay quiet here.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (x) { try { d = { body: e.data.text() }; } catch (y) {} }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(c => c.visibilityState === 'visible')) {
      wins.forEach(c => c.postMessage({ push: d }));
      return;
    }
    await self.registration.showNotification(d.title || 'CareDesk', {
      body: d.body || '',
      tag: d.tag || 'caredesk',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: d.urgent ? [300, 120, 300, 120, 300] : [200, 100, 200],
      requireInteraction: !!d.urgent,
      renotify: true,
      data: { url: d.url || './' }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) { c.postMessage({ go: url }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
