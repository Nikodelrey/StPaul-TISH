// Password lock for the whole site (Cloudflare Pages).
// The username and password are NOT in this file: they are set in Cloudflare under
// Settings > Variables and Secrets as APP_USER and APP_PASS.
// Shows a login page once, then remembers this device for about a year.
// The login is kept two ways: a cookie, and a copy the offline helper (sw.js) sends
// with each request, because Home Screen apps on iPad don't send cookies from sw.js.

const COOKIE = "bsi_auth";
const HEADER = "X-BSI-Auth";
const DAYS = 400;

async function token(env) {
  const data = new TextEncoder().encode("bsi-v1:" + env.APP_USER + ":" + env.APP_PASS);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(req, name) {
  const all = req.headers.get("Cookie") || "";
  for (const part of all.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

const STYLE = `<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:-apple-system,system-ui,sans-serif;background:#f2f4f7;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
form,.box{background:#fff;padding:28px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);width:min(340px,90vw)}
h1{font-size:20px;margin:0 0 18px}
label{display:block;font-size:14px;margin:12px 0 4px}
input{width:100%;box-sizing:border-box;font-size:18px;padding:10px;border:1px solid #bbb;border-radius:8px}
button{width:100%;margin-top:20px;font-size:18px;padding:12px;border:0;border-radius:8px;background:#1f6feb;color:#fff}
.err{color:#c00;font-size:14px;margin-top:10px}
</style>`;

function loginPage(msg) {
  const html = `<!doctype html><html><head><meta charset="utf-8">${STYLE}
<title>Blue Sky Inspections</title></head><body>
<form method="POST" action="/__login">
<h1>Blue Sky Inspections</h1>
<label for="u">Username</label>
<input id="u" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" required>
<label for="p">Password</label>
<input id="p" name="password" type="password" autocomplete="current-password" required>
${msg ? `<div class="err">${msg}</div>` : ""}
<button type="submit">Log in</button>
</form></body></html>`;
  return new Response(html, {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

// After a good login: save the login where the offline helper can find it, start the
// offline helper, then open the app.
function loggedInPage(tok) {
  const html = `<!doctype html><html><head><meta charset="utf-8">${STYLE}
<title>Blue Sky Inspections</title></head><body>
<div class="box"><h1>Logged in</h1><p>Opening the app...</p></div>
<script>
(async function () {
  try {
    var c = await caches.open("bsi-auth");
    await c.put("/__bsi_token", new Response("${tok}"));
  } catch (e) {}
  try {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("/sw.js");
      await Promise.race([navigator.serviceWorker.ready, new Promise(function (r) { setTimeout(r, 4000); })]);
    }
  } catch (e) {}
  location.replace("/");
})();
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE}=${tok}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // These load without logging in: the Home Screen icon, and the offline helper itself
  // (the iPad has to be able to fetch updates to it).
  if (/^\/icon-[a-z0-9-]+\.png$/i.test(path) || path === "/apple-touch-icon.png" ||
      path === "/favicon.ico" || path === "/sw.js") {
    return context.next();
  }

  // Not set up in Cloudflare yet: stay locked.
  if (!env.APP_USER || !env.APP_PASS) return new Response("Locked", { status: 401 });

  const good = await token(env);

  if (path === "/__login" && request.method === "POST") {
    const form = await request.formData();
    const u = String(form.get("username") || "").trim();
    const p = String(form.get("password") || "");
    if (u.toLowerCase() === String(env.APP_USER).toLowerCase() && p === env.APP_PASS) {
      return loggedInPage(good);
    }
    return loginPage("Wrong username or password.");
  }

  if (getCookie(request, COOKIE) === good || request.headers.get(HEADER) === good) {
    return context.next();
  }
  return loginPage("");
}
