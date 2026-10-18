/* ===========================================================================================
   SherigSpace APP GUARD — put this in every app / game you host on GitHub Pages.

   What it does
     1) The app works ONLY when it is open inside an iframe on sherigspace.com.
        Copied link opened in a browser tab, or your app embedded on another website  →  "Permission denied".
     2) The visitor must also be SIGNED IN to SherigSpace.  The site hands the app a one-time ticket
        (valid for 2 minutes, usable once) that proves a signed-in visitor opened it.
        The app never sees the visitor's password or login token.

   How to use (2 lines, as the FIRST things inside <head> of the app's index.html):

     <style id="sg-guard-hide">html{visibility:hidden!important}</style>
     <script src="https://sherigspace.com/sherig-app-guard.js"></script>

   The <style> line keeps the page invisible until the checks pass, so if this script is ever blocked or fails to
   load, the app stays hidden instead of leaking.  Because the script is loaded from sherigspace.com, you can update
   this file ONCE and every app follows.

   Needs APP_ACCESS_SETUP.sql to have been run once in Supabase (only when REQUIRE_SIGN_IN is true).

   Honest limit: this stops normal people (copied links, other websites embedding your app, signed-out visitors).
   It is a browser-side check, so a technical person who downloads the app files from a public GitHub repository can
   still run their own copy.  See APP_SECURITY_GUIDE.md for the stronger (server-side) option.
   =========================================================================================== */
(function (win) {
  'use strict';

  // Websites allowed to show your apps (every level of embedding must be one of these).
  var ALLOWED_ORIGINS = [
    'https://sherigspace.com',
    'https://www.sherigspace.com'
    // 'https://localhost:5500'     // ← remove the leading // only while you test on your own computer
  ];
  var REQUIRE_SIGN_IN = true;                 // false = only the "inside sherigspace.com" rule, no sign-in needed
  var LOGIN_URL = 'https://sherigspace.com/login.html';
  var WAIT_MS = 8000;                         // how long to wait for the website to answer

  var SUPABASE_URL = 'https://kgqlcjdjdhssactfezwi.supabase.co';      // public values, the same ones every SherigSpace page already uses
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtncWxjamRqZGhzc2FjdGZlendpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTE2MzQsImV4cCI6MjA5NTAyNzYzNH0.6hJpg9Zput8wnuDfq7wzb5dRC2KkuRmkmaz870U0Lto';

  function originOf(u) { try { return new URL(u).origin; } catch (e) { return ''; } }
  function inList(o) { return ALLOWED_ORIGINS.indexOf(o) !== -1; }

  // Pure decision, so it can be tested: env = { inFrame, ancestors (array or null), referrer }
  function isAllowed(env) {
    if (!env.inFrame) return false;                                   // opened directly → denied
    if (env.ancestors && env.ancestors.length) {                      // Chrome, Edge, Safari: the browser tells us every parent
      for (var i = 0; i < env.ancestors.length; i++) if (!inList(env.ancestors[i])) return false;
      return true;
    }
    var r = originOf(env.referrer);                                   // Firefox: fall back to the page that embedded us
    return !!r && inList(r);
  }

  function readEnv() {
    var inFrame; try { inFrame = win.self !== win.top; } catch (e) { inFrame = true; }
    var ao = null, loc = win.location;
    if (loc && loc.ancestorOrigins && loc.ancestorOrigins.length) { ao = []; for (var i = 0; i < loc.ancestorOrigins.length; i++) ao.push(loc.ancestorOrigins[i]); }
    return { inFrame: inFrame, ancestors: ao, referrer: win.document.referrer || '' };
  }

  function showMessage(icon, title, text, btnLabel, btnHref, btnTop) {
    try { win.stop(); } catch (e) {}
    var d = win.document;
    d.title = title;
    d.documentElement.innerHTML =
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>' +
      '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1623;color:#e8e4dc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:1.5rem">' +
      '<div style="max-width:420px"><div style="font-size:3rem">' + icon + '</div>' +
      '<h1 style="color:#c9a84c;font-size:1.6rem;margin:.6rem 0">' + title + '</h1>' +
      '<p style="color:#9aa3b8;line-height:1.6;margin:0 0 1.2rem">' + text + '</p>' +
      '<a href="' + btnHref + '"' + (btnTop ? ' target="_top"' : '') + ' style="display:inline-block;padding:12px 24px;background:#c9a84c;color:#1a2340;border-radius:8px;text-decoration:none;font-weight:700">' + btnLabel + '</a></div></body>';
  }
  // After "Permission denied" the button takes the visitor to SherigSpace and tells it which app they wanted,
  // so the site opens that same app for them (after signing in, if needed).
  function homeLink() {
    var back; try { back = win.location.href; } catch (e) { back = ''; }
    return 'https://sherigspace.com/index.html' + (back ? '?openapp=' + encodeURIComponent(back) : '');
  }
  function deny() {
    showMessage('🔒', 'Permission denied', 'This app can only be opened from inside SherigSpace. Tap the button and it will open there (you may be asked to sign in first).', 'Open in SherigSpace', homeLink(), true);
  }
  function needSignIn(reason) {
    if (reason === 'setup') {
      showMessage('⚙️', 'Sign-in check not set up', 'The website owner still needs to finish one setup step (APP_ACCESS_SETUP.sql). Please tell them.', 'Go to SherigSpace', 'https://sherigspace.com', true);
    } else {
      showMessage('🔒', 'Please sign in', 'This app is for signed-in SherigSpace members. Sign in on the website, then open the app from there.', 'Sign in to SherigSpace', LOGIN_URL, true);
    }
  }
  function allow() {
    var s = win.document.getElementById('sg-guard-hide');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    var h = win.document.getElementById('sg-guard-hide-js');
    if (h && h.parentNode) h.parentNode.removeChild(h);
  }

  // Ask the website (our parent frame) for a one-time ticket.  Resolves { ticket, reason }.
  function askParent(parentOrigin) {
    return new Promise(function (resolve) {
      var done = false;
      function onMsg(e) {
        if (e.source !== win.parent || !inList(e.origin)) return;     // only the real sherigspace.com parent may answer
        var d = e.data; if (!d || d.type !== 'sherig-app-ticket') return;
        done = true; win.removeEventListener('message', onMsg);
        resolve({ ticket: d.ticket || null, reason: d.reason || '' });
      }
      win.addEventListener('message', onMsg);
      try { win.parent.postMessage({ type: 'sherig-app-hello' }, parentOrigin); } catch (e) {}
      setTimeout(function () { if (!done) { win.removeEventListener('message', onMsg); resolve({ ticket: null, reason: 'timeout' }); } }, WAIT_MS);
    });
  }
  // Ask the database whether that ticket is genuine (it can be used only once, within 2 minutes).
  function redeem(ticket) {
    return win.fetch(SUPABASE_URL + '/rest/v1/rpc/sherig_app_redeem', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ticket: ticket })
    }).then(function (r) { if (r.status === 404) return 'setup'; return r.ok ? r.json() : false; });
  }

  win.SherigAppGuard = { isAllowed: isAllowed };   // exposed only so the rule can be tested

  // keep the page hidden while we decide, even if the <style> line was forgotten
  if (!win.document.getElementById('sg-guard-hide')) {
    var st = win.document.createElement('style'); st.id = 'sg-guard-hide-js'; st.textContent = 'html{visibility:hidden!important}';
    (win.document.head || win.document.documentElement).appendChild(st);
  }

  var env = readEnv();
  if (!isAllowed(env)) { deny(); return; }
  if (!REQUIRE_SIGN_IN) { allow(); return; }

  var po = (env.ancestors && env.ancestors.length) ? env.ancestors[0] : originOf(env.referrer);
  askParent(po).then(function (a) {
    if (!a.ticket) { needSignIn(a.reason === 'setup' ? 'setup' : 'signin'); return; }
    return redeem(a.ticket).then(function (ok) {
      if (ok === true) allow(); else needSignIn(ok === 'setup' ? 'setup' : 'signin');
    });
  }).catch(function () { needSignIn('signin'); });
})(window);