// Offline support for the inspection app.
// Network first: when online you always get the newest version;
// when offline (or the network fails or takes more than 4 seconds) the last copy saved
// on this device is used.
// It also sends the saved login with each request, because Home Screen apps on iPad
// don't send the login cookie from here.
// Files from cdn.jsdelivr.net (the spelling dictionary) are saved the first time and
// then used offline. They never get the login.
var CACHE = "insp-app-v1";
var WAIT_MS = 4000;

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim());
});

function savedLogin() {
  return caches.open("bsi-auth")
    .then(function (c) { return c.match("/__bsi_token"); })
    .then(function (r) { return r ? r.text() : ""; })
    .catch(function () { return ""; });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Spelling dictionary and other library files: saved copy first, otherwise download and save
  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          return hit || fetch(req).then(function (res) {
            if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  var fromCache = function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || caches.match(self.registration.scope, { ignoreSearch: true });
    });
  };
  var net = savedLogin().then(function (tok) {
    var send = tok ? new Request(req.url, { headers: { "X-BSI-Auth": tok }, credentials: "same-origin" }) : req;
    return fetch(send);
  }).then(function (res) {
    // Only keep good, non-empty pages (never the login page)
    if (res && res.ok && res.headers.get("content-length") !== "0") {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  });
  e.respondWith(new Promise(function (resolve, reject) {
    var done = false;
    // weak signal: after WAIT_MS use the saved copy, if there is one
    var t = setTimeout(function () {
      fromCache().then(function (hit) { if (hit && !done) { done = true; resolve(hit); } });
    }, WAIT_MS);
    net.then(function (res) { clearTimeout(t); if (!done) { done = true; resolve(res); } },
      function () {
        clearTimeout(t);
        fromCache().then(function (hit) {
          if (done) return;
          done = true;
          hit ? resolve(hit) : reject(new Error("offline and nothing saved"));
        });
      });
  }));
});
