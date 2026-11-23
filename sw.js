/* 당지킴 서비스 워커 — 인터넷이 없어도 앱이 열리게 함
 * 전략: 같은 사이트 파일은 '네트워크 우선, 실패하면 저장본' → 새 버전을 올리면 인터넷이 있을 때 바로 반영되고,
 *       인터넷이 없으면 마지막으로 받은 버전으로 열려요. 외부 주소(글꼴·글자 인식)는 건드리지 않아요. */
const CACHE = 'dangjikim-v20261123c';
const SHELL = ['./', 'index.html', 'style.css', 'foods.js', 'foods_db.js', 'nutrition.js', 'label.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
