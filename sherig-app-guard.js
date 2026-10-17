/* ===========================================================================================
   SherigSpace APP GUARD — put this in every app / game you host on GitHub Pages.

   What it does
     • The app works ONLY when it is open inside an iframe on sherigspace.com.
     • If someone copies the app's address and opens it in the browser (or embeds it on another website),
       the page is replaced by "Permission denied" and the app never starts.

   How to use (2 lines, as the FIRST things inside <head> of the app's index.html):

     <style id="sg-guard-hide">html{visibility:hidden!important}</style>
     <script src="https://sherigspace.com/sherig-app-guard.js"></script>

   The <style> line keeps the page invisible until the check passes, so if this script is ever blocked or fails to
   load, the app stays hidden instead of leaking.  Because the script is loaded from sherigspace.com, you can update
   this file ONCE and every app follows.

   Honest limit: this stops normal people (copied links, other websites embedding your app).  It is a browser-side
   check, so a technical person who downloads the app files from a public GitHub repository can still run their own copy.
   See APP_SECURITY_GUIDE.md for the stronger (server-side) option.
   =========================================================================================== */
(function (win) {
  'use strict';

  // Websites allowed to show your apps (every level of embedding must be one of these).
  var ALLOWED_ORIGINS = [
    'https://sherigspace.com',
    'https://www.sherigspace.com'
    // 'http://localhost:5500'     // ← remove the leading // only while you test on your own computer
  ];

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

  function deny() {
    try { win.stop(); } catch (e) {}
    var d = win.document;
    d.title = 'Permission denied';
    d.documentElement.innerHTML =
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Permission denied</title></head>' +
      '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1623;color:#e8e4dc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:1.5rem">' +
      '<div style="max-width:420px"><div style="font-size:3rem">🔒</div>' +
      '<h1 style="color:#c9a84c;font-size:1.6rem;margin:.6rem 0">Permission denied</h1>' +
      '<p style="color:#9aa3b8;line-height:1.6;margin:0 0 1.2rem">This app can only be opened from inside SherigSpace. Please go to the website and open it from there.</p>' +
      '<a href="https://sherigspace.com" style="display:inline-block;padding:12px 24px;background:#c9a84c;color:#1a2340;border-radius:8px;text-decoration:none;font-weight:700">Go to SherigSpace</a></div></body>';
  }

  function allow() {
    var s = win.document.getElementById('sg-guard-hide');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    // if the page was hidden by this script (no inline <style>), show it again
    var h = win.document.getElementById('sg-guard-hide-js');
    if (h && h.parentNode) h.parentNode.removeChild(h);
  }

  win.SherigAppGuard = { isAllowed: isAllowed };   // exposed only so the rule can be tested

  // make sure the page stays hidden while we decide, even if the <style> line was forgotten
  if (!win.document.getElementById('sg-guard-hide')) {
    var st = win.document.createElement('style'); st.id = 'sg-guard-hide-js'; st.textContent = 'html{visibility:hidden!important}';
    (win.document.head || win.document.documentElement).appendChild(st);
  }
  if (isAllowed(readEnv())) allow(); else deny();
})(window);