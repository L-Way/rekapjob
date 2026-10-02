/* push-handler.js — tambahan service worker untuk notifikasi push (aplikasi ditutup).
   Pasang dengan MENAMBAHKAN satu baris ini di PALING ATAS sw.js yang sudah ada:
       importScripts('push-handler.js');
   Lalu tambahkan 'push-handler.js' ke daftar file cache di sw.js (kalau sw.js punya daftar cache),
   dan naikkan nama/versi cache supaya perangkat mengambil sw.js yang baru. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Kaone Motret', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Kaone Motret';
  const options = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || 'kaone-push',   // sama dengan ID notifikasi di aplikasi → tidak muncul dobel
    renotify: false,
    lang: 'id',
    data: { push: true, id: data.tag || null, view: data.view || null }
  };
  event.waitUntil((async () => {
    // Kalau aplikasi sedang terbuka & terlihat, aplikasi sudah menampilkan notifikasinya sendiri.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible')) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  const d = (event.notification && event.notification.data) || {};
  if (!d.push) return;                 // notifikasi lokal lain tetap ditangani handler bawaan sw.js
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const msg = { type: 'notif-click', id: d.id, view: d.view };
    if (wins.length) {
      const w = wins.find((x) => x.focus) || wins[0];
      try { await w.focus(); } catch (e) {}
      w.postMessage(msg);
      return;
    }
    await self.clients.openWindow('./' + (d.view ? '?v=' + encodeURIComponent(d.view) : ''));
  })());
});

// Kalau browser memutar ulang kunci langganan, aplikasi mendaftar ulang saat dibuka berikutnya.
self.addEventListener('pushsubscriptionchange', () => {});
