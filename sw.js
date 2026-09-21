/* Service worker — Kaone Motret
 *
 * Prinsip: index.html SELALU diambil dari jaringan lebih dulu (network-first),
 * jadi kalau Anda mengganti index.html di hosting, versi baru langsung terpakai
 * di pembukaan aplikasi berikutnya. File ini TIDAK perlu diubah saat update aplikasi.
 * Cache hanya dipakai sebagai cadangan kalau sinyal jelek / offline.
 *
 * (Ubah CACHE_VERSION hanya jika suatu saat Anda mengganti ikon/manifest
 *  dan ingin memaksa semua perangkat membuang cache lama.)
 */
'use strict';

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = 'kaone-shell-' + CACHE_VERSION;
const RUNTIME_CACHE = 'kaone-runtime-' + CACHE_VERSION;

const SCOPE     = self.registration.scope;
const SHELL_URL = new URL('index.html', SCOPE).href;
const SCOPE_PATH = new URL(SCOPE).pathname;
const SHELL_PATH = new URL(SHELL_URL).pathname;

const PRECACHE_LOCAL = [
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
].map(p => new URL(p, SCOPE).href);

// Library eksternal yang dipakai index.html — disimpan supaya aplikasi tetap bisa dibuka offline.
const PRECACHE_CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];
// Host statis yang boleh di-cache (font + library). API data (Supabase, OSRM, dll) TIDAK disentuh.
const CACHEABLE_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const NETWORK_TIMEOUT_MS = 4000; // sinyal lambat → pakai cadangan cache setelah 4 detik

// Respons hasil redirect tidak boleh dikembalikan ke navigasi; bersihkan dulu.
async function cleanResponse(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function isShellRequest(req, url) {
  return req.mode === 'navigate' || url.pathname === SHELL_PATH || url.pathname === SCOPE_PATH;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await Promise.allSettled([
      (async () => {
        const res = await cleanResponse(await fetch(new Request(SHELL_URL, { cache: 'reload' })));
        if (res.ok) await shell.put(SHELL_URL, res);
      })(),
      ...PRECACHE_LOCAL.map(async u => {
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if (res.ok) await shell.put(u, res);
      })
    ]);
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.allSettled(PRECACHE_CDN.map(async u => {
      const res = await fetch(new Request(u, { mode: 'no-cors' }));
      await runtime.put(u, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, RUNTIME_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('kaone-') && !keep.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// index.html: jaringan dulu → cache hanya kalau gagal / terlalu lambat.
async function shellNetworkFirst(event) {
  const req = event.request;
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(SHELL_URL, { ignoreSearch: true });

  const networkTask = (async () => {
    // cache:'no-cache' → selalu validasi ke server, abaikan cache HTTP bawaan hosting (mis. max-age GitHub Pages)
    const res = await cleanResponse(await fetch(req, { cache: 'no-cache' }));
    if (res.ok) await cache.put(SHELL_URL, res.clone());
    return res;
  })();

  let result = null;
  try {
    if (cached) {
      const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
      result = await Promise.race([networkTask, timeout]);
    } else {
      result = await networkTask;
    }
  } catch (e) { result = null; }

  if (result && (result.ok || !cached)) return result;
  if (cached) {
    event.waitUntil(networkTask.catch(() => {})); // biarkan selesai di latar belakang, cache ikut diperbarui
    return cached;
  }
  return new Response(
    '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline</title><body style="font-family:sans-serif;background:#1c1a12;color:#f4ecd0;display:flex;' +
    'min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">' +
    '<div><h2>Kaone Motret</h2><p>Belum ada koneksi dan aplikasi belum tersimpan di perangkat ini.<br>' +
    'Sambungkan internet lalu buka kembali.</p></div>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// Font & library: tampilkan cache dulu (cepat), perbarui di belakang layar.
async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request, { ignoreVary: true });
  const fetching = fetch(event.request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { event.waitUntil(fetching); return cached; }
  return (await fetching) || Response.error();
}

// Klik pada notifikasi perangkat (dikirim oleh registration.showNotification di index.html,
// lihat rtSystemNotify): fokuskan tab yang sudah terbuka jika ada, atau buka tab baru.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clientsList) {
      if (new URL(c.url).pathname === SHELL_PATH || new URL(c.url).pathname === SCOPE_PATH) {
        c.postMessage({ type: 'notif-click', id: data.id || null, view: data.view || null });
        return c.focus();
      }
    }
    const target = new URL(SHELL_URL);
    if (data.view) target.searchParams.set('v', data.view);
    return self.clients.openWindow(target.href);
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === new URL('sw.js', SCOPE).pathname) return;       // sw.js selalu langsung ke jaringan
    if (isShellRequest(req, url)) return event.respondWith(shellNetworkFirst(event));
    return event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));   // ikon, manifest
  }
  if (CACHEABLE_HOSTS.includes(url.hostname)) {
    return event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
  }
  // selain itu (Supabase, OSRM, Al-Qur'an API, dll): biarkan lewat normal, tidak di-cache
});
