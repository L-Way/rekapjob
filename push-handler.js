/* push-handler.js — tambahan service worker untuk notifikasi push (aplikasi ditutup).
   Pasang dengan MENAMBAHKAN satu baris ini di PALING ATAS sw.js yang sudah ada:
       importScripts('push-handler.js');
   Lalu tambahkan 'push-handler.js' ke daftar file cache di sw.js (kalau sw.js punya daftar cache),
   dan naikkan nama/versi cache supaya perangkat mengambil sw.js yang baru. */

/* Ikon khusus per jenis notifikasi. Server hanya mengirim kata kunci (mis. ikon: 'pesanan'), bukan alamat gambar,
   jadi isi pesan tidak bisa dipakai untuk menampilkan gambar dari luar. File ikon dicek dulu: kalau belum ada
   di situs, otomatis memakai ikon bawaan (notifikasi tidak pernah tampil tanpa ikon). */
const IKON_PUSH = {
  pesanan: { icon: 'icons/notif-pesanan-192.png', badge: 'icons/notif-badge-96.png' }
};
async function adaFile(path) {
  try { const r = await fetch(path, { cache: 'no-store' }); return !!(r && r.ok); } catch (e) { return false; }
}

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
    const ikon = IKON_PUSH[data.ikon];
    if (ikon) {
      const [okIcon, okBadge] = await Promise.all([adaFile(ikon.icon), adaFile(ikon.badge)]);
      if (okIcon) options.icon = ikon.icon;
      if (okBadge) options.badge = ikon.badge;
    }
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
