/* sw.js — service worker Kaone Motret
   - Notifikasi push (aplikasi ditutup): ditangani push-handler.js
   - Halaman utama (index.html): langsung dari cache supaya aplikasi cepat tampil, lalu
     diperbarui diam-diam di belakang layar (versi baru dipakai pada pembukaan berikutnya,
     atau lewat tombol "Muat Ulang" pada info versi baru di dalam aplikasi)
   - Aset statis (ikon, manifest): cache-first */
importScripts('push-handler.js');

const CACHE = 'kaone-motret-v4';
const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'push-handler.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, font, dll: langsung ke jaringan

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (isPage) {
    // Permintaan dengan parameter (mis. cek versi baru ?v=...) selalu ke jaringan, cache sebagai cadangan.
    if (url.search !== '' && req.mode !== 'navigate') {
      event.respondWith(fetch(req).catch(() => caches.match('index.html')));
      return;
    }
    // Pembukaan aplikasi: tampilkan cache seketika, perbarui cache di belakang layar.
    event.respondWith((async () => {
      const cached = (await caches.match('index.html')) || (await caches.match('./'));
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok && url.search === '') {
            const copy = res.clone();
            return caches.open(CACHE).then((c) => c.put('index.html', copy)).then(() => res);
          }
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return (await refresh) || Response.error();
    })());
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

/* Klik notifikasi lokal (bukan push) dari aplikasi */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = (event.notification && event.notification.data) || {};
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const msg = { type: 'notif-click', id: d.id || null, view: d.view || null };
    if (wins.length) {
      const w = wins.find((x) => x.focus) || wins[0];
      try { await w.focus(); } catch (e) {}
      w.postMessage(msg);
      return;
    }
    await self.clients.openWindow('./' + (d.view ? '?v=' + encodeURIComponent(d.view) : ''));
  })());
});
