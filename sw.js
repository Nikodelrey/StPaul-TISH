/* Offline helper for Nick's inspection apps (Maplewood, SSP, St. Paul, Minneapolis).
   Upload this file next to index.html in each repo — the same file works in all of them.
   - The app page: tries the internet first (so updates show up), uses the saved copy
     when there's no signal or it takes more than 4 seconds.
   - Other files (spelling dictionary etc.): saved the first time, then used offline. */
const CACHE = 'tish-app::' + self.registration.scope;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

function fromNetwork(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('slow')), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate' ||
    (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));

  if (isPage) {
    // the app itself: newest version when online, saved copy when not
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await fromNetwork(req, 4000);
        if (r && r.ok) c.put('./index.html', r.clone());
        return r;
      } catch (err) {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // everything else: saved copy first, otherwise download and save it
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
      return r;
    } catch (err) {
      return Response.error();
    }
  })());
});
