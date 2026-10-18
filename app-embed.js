/* SherigSpace — opens protected apps (games / tools hosted on GitHub Pages) INSIDE a viewer on this website,
   and gives each app a one-time "signed-in" ticket.  Works together with sherig-app-guard.js (inside every app).

   What it does
     • Any link or window.open() that points to a protected app is shown in a full-screen viewer (an iframe)
       instead of a new browser tab, so the app's address is never visited directly.
     • Visitors who are not signed in are asked to sign in first (when REQUIRE_SIGN_IN is true).
     • The app asks this page for a ticket; this page gets one from the database (only possible when signed in)
       and passes it on.  The app never receives the visitor's login token.
     • Everything else (YouTube, Google Drive, normal websites) opens exactly as before.

   Which addresses count as protected apps (edit the list below if needed):
     • anything on  *.github.io
     • any sub-address of sherigspace.com other than www   (for example tugofwar.sherigspace.com)
     • plus the extra hosts you list in EXTRA_HOSTS */
(function (win) {
  'use strict';
  if (win.SherigApps) return;

  var GITHUB_PAGES = true;
  var SHERIG_SUBDOMAINS = true;
  var EXTRA_HOSTS = [];            // e.g. ['games.mydomain.org']
  var REQUIRE_SIGN_IN = true;      // must match REQUIRE_SIGN_IN in sherig-app-guard.js
  var LOGIN_PAGE = './login.html';
  // Apps the "Open in SherigSpace" button may open automatically. Sub-addresses of sherigspace.com are always allowed.
  // If your apps live on a github.io address, add that exact host here, e.g. ['yourname.github.io'].
  var TRUSTED_APP_HOSTS = [];
  var PENDING_KEY = 'sherig_pending_app';

  var SUPABASE_URL = 'https://kgqlcjdjdhssactfezwi.supabase.co';   // public values, the same ones every SherigSpace page already uses
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtncWxjamRqZGhzc2FjdGZlendpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTE2MzQsImV4cCI6MjA5NTAyNzYzNH0.6hJpg9Zput8wnuDfq7wzb5dRC2KkuRmkmaz870U0Lto';
  var STORAGE_KEY = 'sb-' + (function () { try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch (e) { return ''; } })() + '-auth-token';

  function parse(u) { try { return new URL(String(u), win.location.href); } catch (e) { return null; } }
  function shouldEmbed(u) {
    var x = parse(u); if (!x || !/^https?:$/.test(x.protocol)) return false;
    var h = x.hostname.toLowerCase();
    if (EXTRA_HOSTS.indexOf(h) !== -1) return true;
    if (GITHUB_PAGES && /\.github\.io$/.test(h)) return true;
    if (SHERIG_SUBDOMAINS && /\.sherigspace\.com$/.test(h) && h !== 'www.sherigspace.com') return true;
    return false;
  }

  // ── the visitor's sign-in (the same session this website already keeps in the browser) ──
  function readSession() {
    try {
      var raw = win.localStorage.getItem(STORAGE_KEY); if (!raw) return null;
      var s = JSON.parse(raw); if (Array.isArray(s)) s = s[0];
      return s && s.access_token ? s : null;
    } catch (e) { return null; }
  }
  function valid(s) { return !!s && (!s.expires_at || s.expires_at * 1000 > Date.now() + 5000); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function freshSession() {            // the page's own sign-in code renews the session in the background; wait for it if needed
    var s = readSession(); if (valid(s)) return s;
    for (var i = 0; i < 8; i++) { await sleep(500); s = readSession(); if (valid(s)) return s; }
    return null;
  }
  async function getTicket() {
    var s = await freshSession(); if (!s) return { ticket: null, reason: 'signin' };
    try {
      var r = await win.fetch(SUPABASE_URL + '/rest/v1/rpc/sherig_app_ticket', {
        method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: '{}'
      });
      if (r.status === 404) return { ticket: null, reason: 'setup' };
      if (r.status === 401 || r.status === 403) return { ticket: null, reason: 'signin' };
      if (!r.ok) return { ticket: null, reason: 'error' };
      var t = await r.json();
      return t ? { ticket: t } : { ticket: null, reason: 'signin' };
    } catch (e) { return { ticket: null, reason: 'error' }; }
  }

  // an app (inside an iframe on THIS page) asks "is a signed-in person here?"
  win.addEventListener('message', function (e) {
    var d = e.data; if (!d || d.type !== 'sherig-app-hello' || !e.origin || e.origin === 'null') return;
    var frames = win.document.querySelectorAll('iframe'), mine = false;
    for (var i = 0; i < frames.length; i++) { try { if (frames[i].contentWindow === e.source) { mine = true; break; } } catch (x) {} }
    if (!mine) return;                                       // only answer frames that are on this page
    getTicket().then(function (r) {
      try { e.source.postMessage({ type: 'sherig-app-ticket', ticket: r.ticket || null, reason: r.reason || '' }, e.origin); } catch (x) {}
    });
  });

  // ── the viewer ──
  var current = null;
  function close() {
    if (!current) return;
    try { if (win.document.fullscreenElement) win.document.exitFullscreen(); } catch (e) {}
    current.overlay.remove();
    win.document.body.style.overflow = current.prevOverflow;
    win.document.removeEventListener('keydown', current.onKey, true);
    current = null;
  }
  function signInPrompt() {
    close();
    var d = win.document, ov = d.createElement('div'); ov.id = 'sherig-app-viewer';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ov.innerHTML = '<div style="background:#1a2340;color:#e8e4dc;border-radius:16px;max-width:380px;width:100%;padding:1.5rem;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
      '<div style="font-size:2.4rem">🔒</div><h3 style="margin:.4rem 0;color:#c9a84c">Please sign in</h3>' +
      '<p style="color:#9aa3b8;line-height:1.6;margin:0 0 1.1rem;font-size:.92rem">This app is for signed-in SherigSpace members. Sign in, then open it again.</p>' +
      '<a data-sg="login" href="' + LOGIN_PAGE + '" style="display:inline-block;padding:10px 22px;background:#c9a84c;color:#1a2340;border-radius:8px;text-decoration:none;font-weight:700;margin-right:.5rem">Sign in</a>' +
      '<button data-sg="cancel" type="button" style="padding:10px 18px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#e8e4dc;border-radius:8px;cursor:pointer">Cancel</button></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || (e.target.getAttribute && e.target.getAttribute('data-sg') === 'cancel')) ov.remove(); });
    d.body.appendChild(ov);
    return null;
  }

  function open(url, title) {
    var x = parse(url); if (!x) return null;
    if (x.protocol === 'http:') x.protocol = 'https:';      // a secure (https) site cannot show an insecure (http) app, so always use https
    if (REQUIRE_SIGN_IN && !readSession()) return signInPrompt();
    close();
    var d = win.document;
    var overlay = d.createElement('div'); overlay.id = 'sherig-app-viewer'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0f1623;display:flex;flex-direction:column';
    var bar = d.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:.6rem;padding:.5rem .8rem;background:#1a2340;color:#e8e4dc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:.9rem;flex:none';
    var t = d.createElement('div'); t.style.cssText = 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600';
    t.textContent = title || x.hostname;
    function btn(label, aria, fn) { var b = d.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.style.cssText = 'border:1px solid rgba(255,255,255,.25);background:transparent;color:#e8e4dc;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:.85rem'; b.onclick = fn; return b; }
    var stage = d.createElement('div'); stage.style.cssText = 'flex:1;position:relative;background:#fff;min-height:0';
    var loading = d.createElement('div'); loading.textContent = 'Opening the app…';
    loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#64748b;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    var frame = d.createElement('iframe');
    frame.title = title || 'App';
    frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-write; encrypted-media; accelerometer; gyroscope; picture-in-picture');
    frame.setAttribute('referrerpolicy', 'origin');     // tells the app "I am sherigspace.com" (needed by the app guard in Firefox)
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent';
    stage.appendChild(loading); stage.appendChild(frame);
    bar.appendChild(t);
    bar.appendChild(btn('⛶ Full screen', 'Full screen', function () { try { (frame.requestFullscreen || frame.webkitRequestFullscreen).call(frame); } catch (e) {} }));
    bar.appendChild(btn('✕ Close', 'Close', close));
    overlay.appendChild(bar); overlay.appendChild(stage);
    var prevOverflow = d.body.style.overflow; d.body.style.overflow = 'hidden';
    function onKey(e) { if (e.key === 'Escape') close(); }
    d.addEventListener('keydown', onKey, true);
    d.body.appendChild(overlay);
    frame.src = x.href;
    current = { overlay: overlay, prevOverflow: prevOverflow, onKey: onKey };
    return frame;
  }

  // 1) normal links:  <a href="https://tugofwar.sherigspace.com/"> …
  win.document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download') || !shouldEmbed(a.href)) return;
    e.preventDefault();
    open(a.href, a.getAttribute('data-title') || (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80));
  }, true);

  // 2) window.open(url): the site's own "open" buttons
  var nativeOpen = win.open;
  win.open = function (url) {
    if (url && shouldEmbed(url)) { open(url); return null; }
    return nativeOpen.apply(win, arguments);
  };


  // ── "Open in SherigSpace": a copied app link sends the visitor here with ?openapp=<the app address> ──
  function deepLinkAllowed(u) {
    var x = parse(u); if (!x || !shouldEmbed(x.href)) return false;
    var h = x.hostname.toLowerCase();
    return /\.sherigspace\.com$/.test(h) || TRUSTED_APP_HOSTS.indexOf(h) !== -1;   // never open an arbitrary address from a link
  }
  function stashPending(u) { try { win.localStorage.setItem(PENDING_KEY, JSON.stringify({ url: u, t: Date.now() })); } catch (e) {} }
  function takePending() {
    try {
      var o = JSON.parse(win.localStorage.getItem(PENDING_KEY) || 'null'); win.localStorage.removeItem(PENDING_KEY);
      return o && o.url && Date.now() - o.t < 10 * 60000 ? o.url : null;       // forgotten after 10 minutes
    } catch (e) { return null; }
  }
  async function waitForSession(ms) { var t = Date.now(); while (Date.now() - t < ms) { if (readSession()) return true; await sleep(300); } return !!readSession(); }
  async function init() {
    var wanted = null, url;
    try { url = new URL(win.location.href); wanted = url.searchParams.get('openapp'); } catch (e) {}
    if (wanted) {
      try { url.searchParams.delete('openapp'); win.history.replaceState(null, '', url.pathname + url.search + url.hash); } catch (e) {}   // tidy the address bar
      if (!deepLinkAllowed(wanted)) return;
      if (await waitForSession(1200)) { win.localStorage.removeItem(PENDING_KEY); open(wanted); }
      else { stashPending(wanted); signInPrompt(); }                                // sign in, then we open it for you
      return;
    }
    var p = takePending();                                                           // came back after signing in?
    if (!p) return;
    if (!deepLinkAllowed(p)) return;
    if (await waitForSession(4000)) open(p); else stashPending(p);
  }
  if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', init); else init();

  win.SherigApps = { shouldEmbed: shouldEmbed, open: open, close: close };
})(window);