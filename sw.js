const CACHE = 'bebek-takip-v21';
const SHELL = ['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

function isHtml(req){
  return req.mode === 'navigate' ||
         (req.headers.get('accept')||'').includes('text/html') ||
         new URL(req.url).pathname.endsWith('/index.html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co')) return;   // API trafiği asla önbelleğe alınmaz

  // HTML: ÖNCE AĞ. Böylece yeni sürüm hemen gelir; ağ yoksa önbellekten açılır.
  if (isHtml(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c=>c.put('./index.html', copy)).catch(()=>{});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Diğer varlıklar (ikon, yazı tipi, kütüphane): önce önbellek, arkada tazele
  // Ses dosyaları: bir kez indirilir, sonra hep önbellekten (çevrimdışı ninni)
  if (url.pathname.includes('/audio/')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)).catch(()=>{}); }
        return res;
      }))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then(c=>c.put(req, copy)).catch(()=>{});
        }
        return res;
      }).catch(()=>cached);
      return cached || network;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Bebek Takip', body: 'Hatırlatma' };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title || 'Bebek Takip', {
    body: data.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
    tag: data.tag || 'reminder', renotify: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window'}).then((list)=>{
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
