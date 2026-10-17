/* SherigSpace — opens protected apps (games / tools hosted on GitHub Pages) INSIDE a viewer on this website.
   Used with sherig-app-guard.js: the app itself refuses to run unless it is inside sherigspace.com.

   What it does
     • Any link or window.open() that points to a protected app is shown in a full-screen viewer (an iframe)
       instead of opening a new browser tab — so the app's address is never "visited" directly.
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

  function parse(u) { try { return new URL(String(u), win.location.href); } catch (e) { return null; } }
  function shouldEmbed(u) {
    var x = parse(u); if (!x || !/^https?:$/.test(x.protocol)) return false;
    var h = x.hostname.toLowerCase();
    if (EXTRA_HOSTS.indexOf(h) !== -1) return true;
    if (GITHUB_PAGES && /\.github\.io$/.test(h)) return true;
    if (SHERIG_SUBDOMAINS && /\.sherigspace\.com$/.test(h) && h !== 'www.sherigspace.com') return true;
    return false;
  }

  var current = null;
  function close() {
    if (!current) return;
    try { if (win.document.fullscreenElement) win.document.exitFullscreen(); } catch (e) {}
    current.overlay.remove();
    win.document.body.style.overflow = current.prevOverflow;
    win.document.removeEventListener('keydown', current.onKey, true);
    current = null;
  }

  function open(url, title) {
    var x = parse(url); if (!x) return null;
    close();
    var d = win.document;
    var overlay = d.createElement('div'); overlay.id = 'sherig-app-viewer'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0f1623;display:flex;flex-direction:column';
    var bar = d.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:.6rem;padding:.5rem .8rem;background:#1a2340;color:#e8e4dc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:.9rem;flex:none';
    var t = d.createElement('div'); t.style.cssText = 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600';
    t.textContent = title || x.hostname;
    function btn(label, aria, fn) { var b = d.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.style.cssText = 'border:1px solid rgba(255,255,255,.25);background:transparent;color:#e8e4dc;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:.85rem'; b.onclick = fn; return b; }
    var frame = d.createElement('iframe');
    frame.title = title || 'App';
    frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-write; encrypted-media; accelerometer; gyroscope; picture-in-picture');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'origin');     // tells the app "I am sherigspace.com" (needed by the app guard in Firefox)
    frame.style.cssText = 'flex:1;width:100%;border:0;background:#fff';
    bar.appendChild(t);
    bar.appendChild(btn('⛶ Full screen', 'Full screen', function () { try { (frame.requestFullscreen || frame.webkitRequestFullscreen).call(frame); } catch (e) {} }));
    bar.appendChild(btn('✕ Close', 'Close', close));
    overlay.appendChild(bar); overlay.appendChild(frame);
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

  win.SherigApps = { shouldEmbed: shouldEmbed, open: open, close: close };
})(window);