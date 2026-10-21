/* SherigSpace — opens apps (games / tools hosted on GitHub Pages) INSIDE a viewer on this website and applies the
   rules you set in  Admin → Settings → "Apps & games protection"  (which can follow Free Mode).
   Works together with sherig-app-guard.js (inside every app).

   What it does
     • Any link or window.open() that points to an app is shown in a full-screen viewer (an iframe) instead of a
       new browser tab, so the app's address is never "visited" directly.
     • Not protected (for example Free Mode is ON): the viewer simply opens the app for everyone.
     • Protected: the visitor must be signed in, and (if you chose "paid members") must be a member, teacher, admin
       or a student in a class. Otherwise they see a clear message instead of the app.
     • The app asks this page for a one-time ticket; this page gets one from the database (only when the visitor is
       allowed) and passes it on. The app never receives the visitor's login token.
     • Everything else (YouTube, Google Drive, normal websites) opens exactly as before.

   Which addresses count as apps (edit the list below if needed):
     • anything on  *.github.io
     • any sub-address of sherigspace.com other than www   (for example tugofwar.sherigspace.com)
     • plus the extra hosts you list in EXTRA_HOSTS */
(function (win) {
  'use strict';
  if (win.SherigApps) return;

  var GITHUB_PAGES = true;
  var SHERIG_SUBDOMAINS = true;
  var EXTRA_HOSTS = [];            // e.g. ['games.mydomain.org']
  var LOGIN_PAGE = './login.html';
  // Apps the "Open in SherigSpace" button may open automatically. Sub-addresses of sherigspace.com are always allowed.
  // If your apps live on a github.io address, add that exact host here, e.g. ['yourname.github.io'].
  var TRUSTED_APP_HOSTS = [];
  var PENDING_KEY = 'sherig_pending_app';

  var SUPABASE_URL = 'https://kgqlcjdjdhssactfezwi.supabase.co';   // public values, the same ones every SherigSpace page already uses
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtncWxjamRqZGhzc2FjdGZlendpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTE2MzQsImV4cCI6MjA5NTAyNzYzNH0.6hJpg9Zput8wnuDfq7wzb5dRC2KkuRmkmaz870U0Lto';
  var STORAGE_KEY = 'sb-' + (function () { try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch (e) { return ''; } })() + '-auth-token';

  function parse(u) { try { return new URL(String(u), win.location.href); } catch (e) { return null; } }
  // the app's address as the rules know it: "lpgenerator.sherigspace.com", or "name.github.io/project" for GitHub project pages
  function appKey(u) {
    var x = parse(u); if (!x) return null; var h = x.hostname.toLowerCase();
    if (/\.github\.io$/.test(h)) { var seg = (x.pathname.split('/').filter(Boolean)[0] || '').toLowerCase(); if (/^[a-z0-9._-]+$/.test(seg)) return h + '/' + seg; }
    return h;
  }
  // a random id for THIS browser, used only to count how many devices share one paid membership
  function deviceId() {
    try {
      var d = win.localStorage.getItem('sherig_device_id');
      if (!d) { d = (win.crypto && win.crypto.randomUUID) ? win.crypto.randomUUID() : ('d' + Math.random().toString(36).slice(2) + Date.now().toString(36)); win.localStorage.setItem('sherig_device_id', d); }
      return d;
    } catch (ex) { return 'no-storage-device'; }
  }
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
    var s = readSession(); if (!s) return null;
    if (valid(s)) return s;
    for (var i = 0; i < 8; i++) { await sleep(500); s = readSession(); if (valid(s)) return s; }
    return null;
  }
  function rpc(name, bearer, body) {
    return win.fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + (bearer || SUPABASE_KEY), 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    });
  }

  // ── the rules from Admin → Settings (and Free Mode) ──
  var policies = {};                           // one cached rule per app address, for 60 seconds
  function cachedPolicy(key) { var c = policies[key]; return c && Date.now() - c.at < 60000 ? c.p : null; }
  async function getPolicy(key) {
    var c = cachedPolicy(key); if (c) return c;
    var p = { protect: true, audience: 'signed_in' };                       // if we cannot find out, stay protected
    try {
      var r = await rpc('sherig_app_policy', null, { p_key: key });
      if (r.ok) { var j = await r.json(); if (j && typeof j.protect === 'boolean') p = j; }
    } catch (ex) {}
    policies[key] = { p: p, at: Date.now() }; return p;
  }
  // may THIS visitor open protected apps?  → { allowed, reason }
  async function checkAccess(key) {
    var s = await freshSession();
    if (!s) return { allowed: false, reason: 'signin' };
    try {
      var r = await rpc('sherig_app_access', s.access_token, { p_key: key });
      if (r.status === 404) return { allowed: false, reason: 'setup' };
      if (!r.ok) return { allowed: false, reason: 'signin' };
      var d = await r.json(); return { allowed: !!(d && d.allowed), reason: (d && d.reason) || '' };
    } catch (e) { return { allowed: false, reason: 'error' }; }
  }
  // what the app gets when it asks: { free } or { ticket } or { ticket:null, reason }
  async function getPass(key) {
    var s = await freshSession();
    try {
      var r = await rpc('sherig_app_pass', s ? s.access_token : null, { p_key: key, p_device: deviceId() });
      if (r.status === 404) return { ticket: null, reason: 'setup' };
      if (!r.ok) return { ticket: null, reason: s ? 'error' : 'signin' };
      var d = await r.json();
      if (d && d.protect === false) return { free: true };
      if (d && d.allowed && d.ticket) return { ticket: d.ticket };
      return { ticket: null, reason: (d && d.reason) || 'signin' };
    } catch (e) { return { ticket: null, reason: 'error' }; }
  }

  // an app (inside an iframe on THIS page) asks "may I run?"
  win.addEventListener('message', function (e) {
    var d = e.data; if (!d || d.type !== 'sherig-app-hello' || !e.origin || e.origin === 'null') return;
    var frames = win.document.querySelectorAll('iframe'), mine = null;
    for (var i = 0; i < frames.length; i++) { try { if (frames[i].contentWindow === e.source) { mine = frames[i]; break; } } catch (x) {} }
    if (!mine) return;                                       // only answer frames that are on this page
    getPass(appKey(mine.src)).then(function (r) {
      try { e.source.postMessage({ type: 'sherig-app-ticket', ticket: r.ticket || null, reason: r.reason || '', free: !!r.free }, e.origin); } catch (x) {}
    });
  });

  // ── the viewer and the small message boxes ──
  var current = null;
  function close() {
    if (!current) return;
    try { if (win.document.fullscreenElement) win.document.exitFullscreen(); } catch (e) {}
    current.overlay.remove();
    win.document.body.style.overflow = current.prevOverflow;
    win.document.removeEventListener('keydown', current.onKey, true);
    current = null;
  }
  function promptBox(icon, title, text, btnLabel, onBtn) {
    close();
    var d = win.document, old = d.getElementById('sherig-app-viewer'); if (old) old.remove();
    var ov = d.createElement('div'); ov.id = 'sherig-app-viewer';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ov.innerHTML = '<div style="background:#1a2340;color:#e8e4dc;border-radius:16px;max-width:380px;width:100%;padding:1.5rem;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
      '<div style="font-size:2.4rem">' + icon + '</div><h3 style="margin:.4rem 0;color:#c9a84c">' + title + '</h3>' +
      '<p style="color:#9aa3b8;line-height:1.6;margin:0 0 1.1rem;font-size:.92rem">' + text + '</p>' +
      '<button data-sg="go" type="button" style="padding:10px 22px;background:#c9a84c;color:#1a2340;border:0;border-radius:8px;font-weight:700;cursor:pointer;margin-right:.5rem">' + btnLabel + '</button>' +
      '<button data-sg="cancel" type="button" style="padding:10px 18px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#e8e4dc;border-radius:8px;cursor:pointer">Cancel</button></div>';
    ov.addEventListener('click', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-sg');
      if (e.target === ov || k === 'cancel') ov.remove();
      else if (k === 'go') { ov.remove(); onBtn(); }
    });
    d.body.appendChild(ov);
    return null;
  }
  function signInPrompt() { return promptBox('🔒', 'Please sign in', 'This app is for signed-in SherigSpace members. Sign in, then open it again.', 'Sign in', function () { win.location.href = LOGIN_PAGE; }); }
  function membersPrompt() {
    return promptBox('⭐', 'Members only', 'This app is for SherigSpace members. Become a member to open it.', 'See membership', function () {
      if (typeof win.openPaymentModal === 'function') win.openPaymentModal('membership', 'general', 'Site Membership', typeof win.membershipPrice === 'function' ? win.membershipPrice() : 0);
      else win.location.href = './index.html';
    });
  }
  function setupPrompt() { return promptBox('⚙️', 'Setup not finished', 'The website owner still needs to run APP_CONTROL_SETUP.sql in Supabase. Please tell them.', 'OK', function () {}); }

  function logOpen(x) {                      // which app was opened (best effort; never blocks anything)
    try { var s = readSession(); rpc('sherig_app_log', s && valid(s) ? s.access_token : null, { p_key: appKey(x.href) }).catch(function () {}); } catch (ex) {}
  }
  function showViewer(x, title) {
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
    logOpen(x);
    current = { overlay: overlay, prevOverflow: prevOverflow, onKey: onKey };
    return frame;
  }

  // open an app, applying the rules from Admin → Settings
  function decide(x, title, pol, key) {
    if (!pol.protect) return showViewer(x, title);                              // not protected (e.g. Free Mode ON)
    if (!readSession()) return signInPrompt();                                  // protected: must be signed in
    if (pol.audience === 'signed_in') return showViewer(x, title);              // ...any signed-in member is enough
    checkAccess(key).then(function (a) {                                           // ...paid members, teachers, admins, class students
      if (a.allowed) showViewer(x, title);
      else if (a.reason === 'members') membersPrompt();
      else if (a.reason === 'setup') setupPrompt();
      else signInPrompt();
    });
    return null;
  }
  function open(url, title) {
    var x = parse(url); if (!x) return null;
    if (x.protocol === 'http:') x.protocol = 'https:';      // a secure (https) site cannot show an insecure (http) app, so always use https
    var key = appKey(x.href), c = cachedPolicy(key);
    if (c) return decide(x, title, c, key);
    getPolicy(key).then(function (p) { decide(x, title, p, key); });
    return null;
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
      var pol = await getPolicy(appKey(wanted));
      if (!pol.protect) { open(wanted); return; }
      if (await waitForSession(1200)) { win.localStorage.removeItem(PENDING_KEY); open(wanted); }
      else { stashPending(wanted); signInPrompt(); }                            // sign in, then we open it for you
      return;
    }
    var p = takePending();                                                       // came back after signing in?
    if (!p || !deepLinkAllowed(p)) return;
    if (await waitForSession(4000)) open(p); else stashPending(p);
  }
  if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', init); else init();

  win.SherigApps = { shouldEmbed: shouldEmbed, open: open, close: close, appKey: appKey };
})(window);
