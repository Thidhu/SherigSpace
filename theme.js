/* ─────────────────────────────────────────────────────────────
   SherigSpace — shared DAY / NIGHT mode for every page
   (login, student, teacher, admin).  index.html has its own toggle
   but uses the same saved setting, so the choice follows the visitor
   from page to page.

   • Night mode = the original navy + gold look (page defaults).
   • Day mode   = warm ivory + golden orange. The top bar / sidebar stay
     navy, exactly like the main website.
   ───────────────────────────────────────────────────────────── */
(function () {
  var KEY = 'eduTheme';
  var root = document.documentElement;

  function read() {
    try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; }
    catch (e) { return 'dark'; }
  }
  function label(t) { return t === 'light' ? '🌙 Night mode' : '☀️ Day mode'; }
  function refresh() {
    var t = root.getAttribute('data-theme');
    var btns = document.querySelectorAll('.sherig-theme-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = label(t);
      btns[i].setAttribute('aria-label', t === 'light' ? 'Switch to night mode' : 'Switch to day mode');
    }
  }
  function set(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    refresh();
  }
  function toggle() { set(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); }

  // Apply immediately (before the page paints) so there is no flash.
  root.setAttribute('data-theme', read());

  var css = [
    /* ── toggle button ── */
    '.sherig-theme-btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;cursor:pointer;user-select:none;-webkit-user-select:none;',
    'border:1px solid var(--border);background:rgba(201,168,76,.10);color:var(--gold-text,var(--gold));padding:7px 13px;border-radius:999px;',
    "font:600 .78rem/1.2 'DM Sans',sans-serif;transition:background .2s;white-space:nowrap}",
    '.sherig-theme-btn:hover{background:rgba(201,168,76,.22)}',
    '.sfoot .sherig-theme-btn{display:flex;border-radius:4px;padding:8px;font-size:.8rem}',
    '.sherig-theme-float{position:fixed;top:14px;right:14px;z-index:3000;box-shadow:0 6px 20px rgba(0,0,0,.25);background:var(--surface)}',

    /* ── DAY MODE colour tokens ── */
    '[data-theme="light"]{color-scheme:light;--navy:#fffaf1;--surface:#ffffff;--surface2:#fbf0d9;--border:rgba(214,140,20,.30);',
    '--text:#1a2340;--text2:#5d584b;--gold:#e0951c;--gold-light:#f5c25a;--gold-text:#a35a00;',
    '--red:#cf3f3f;--green:#2a9160;--blue:#2f6fd6;--ok-text:#1e8a5a;--err-text:#c0392b}',

    /* top bar + sidebar stay navy in day mode (same as the main site) */
    '[data-theme="light"] :is(nav,.sidebar){--navy:#0f1623;--surface:#192035;--surface2:#202b4a;--border:rgba(201,168,76,.2);',
    '--text:#e8e4dc;--text2:#9aa3b8;--gold:#c9a84c;--gold-light:#e8c97a;--gold-text:#c9a84c;',
    '--red:#e05c5c;--green:#4caf84;--blue:#5c8de0;color:#e8e4dc}',

    /* "checking access" screens */
    '[data-theme="light"] #gate{background:linear-gradient(135deg,#fff4da,#fffaf1,#ffe6b3)}',
    '[data-theme="light"] .gate-card{background:#ffffff;box-shadow:0 24px 60px rgba(150,90,10,.20)}',

    /* login page */
    '[data-theme="light"] .bg{background:linear-gradient(135deg,#fff4da 0%,#fffaf1 60%,#ffe6b3 100%)}',
    '[data-theme="light"] .card{background:#ffffff;box-shadow:0 24px 60px rgba(150,90,10,.18)}',
    '[data-theme="light"] .tab{background:rgba(224,149,28,.07)}',
    '[data-theme="light"] .field input::placeholder{color:rgba(26,35,64,.38)}',
    '[data-theme="light"] .btn-google{background:#ffffff;border-color:#e8d5a8}',
    '[data-theme="light"] .btn-google:hover{background:#fff3dc;border-color:var(--gold)}',
    '[data-theme="light"] .divider::before,[data-theme="light"] .divider::after{background:rgba(26,35,64,.14)}',
    '[data-theme="light"] .btn-cancel{background:rgba(26,35,64,.06);border-color:rgba(26,35,64,.14)}',
    '[data-theme="light"] .btn-cancel:hover{background:rgba(26,35,64,.12)}',
    '[data-theme="light"] footer{color:rgba(26,35,64,.5)}',
    '[data-theme="light"] .modal-box{background:#fffdf8;box-shadow:0 20px 60px rgba(60,35,0,.30)}',

    /* admin + teacher: popups, form fields, lists */
    '[data-theme="light"] .overlay .modal{background:#fffdf8}',
    '[data-theme="light"] .modal:not(.overlay .modal){background:rgba(26,35,64,.55)}',
    '[data-theme="light"] .modal-box .modal-field input,[data-theme="light"] .modal-field input{background:var(--surface2)}',
    '[data-theme="light"] .field input,[data-theme="light"] .field select,[data-theme="light"] .field textarea{background:var(--surface2)}',
    '[data-theme="light"] .field select option{background:#ffffff;color:#1a2340}',
    '[data-theme="light"] .overlay{background:rgba(26,35,64,.55)}',
    '[data-theme="light"] .irow{border-bottom-color:rgba(26,35,64,.08)}',
    '[data-theme="light"] .irow:hover{background:rgba(224,149,28,.07)}',
    '[data-theme="light"] .utbl td{border-bottom-color:rgba(26,35,64,.08)}',
    '[data-theme="light"] .utbl tr:hover td{background:rgba(224,149,28,.07)}',
    '[data-theme="light"] .info-box code{background:rgba(26,35,64,.08)}',

    /* soft shadows so white cards stand out on ivory */
    '[data-theme="light"] :is(.card,.assign-card,.stat-card,.class-card,.panel){box-shadow:0 2px 14px rgba(150,90,10,.10)}'
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'sherig-theme-css';
  style.textContent = css;
  (document.head || root).appendChild(style);

  function makeButton(extraClass) {
    var b = document.createElement('div');
    b.className = 'sherig-theme-btn' + (extraClass ? ' ' + extraClass : '');
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.addEventListener('click', toggle);
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    return b;
  }

  function mount() {
    var slots = document.querySelectorAll('[data-theme-slot]');
    if (slots.length) {
      for (var i = 0; i < slots.length; i++) slots[i].appendChild(makeButton());
    } else {
      document.body.appendChild(makeButton('sherig-theme-float'));
    }
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // keep several open tabs / pages in step
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { root.setAttribute('data-theme', read()); refresh(); }
  });
})();

/* ─────────────────────────────────────────────────────────────
   SherigSpace — shared EN / DZONGKHA language toggle for every
   page (login, student, teacher, admin). index.html has its own
   copy of this same toggle, but both read/write the same 'eduLang'
   key, so the choice follows the visitor from page to page.

   Two ways to mark text as translatable:
   1. Static HTML:  <span data-en="Save" data-dz="སྲུང་བཞག">Save</span>
      — applyLang() swaps the element's content to match.
   2. Text built by JS at render time: window.T('Save','སྲུང་བཞག')
      returns the right string for whichever language is active
      right now. Pages that keep dynamic lists (assignments,
      classes, students…) should listen for 'sherig:langchange'
      and re-run their render function so already-drawn content
      updates too — see teacher.html / student.html for examples.
   ───────────────────────────────────────────────────────────── */
(function () {
  var KEY = 'eduLang';
  var root = document.documentElement;

  function read() {
    try { return localStorage.getItem(KEY) === 'dz' ? 'dz' : 'en'; }
    catch (e) { return 'en'; }
  }

  // Apply immediately (before paint) so there's no flash / no font jump.
  root.setAttribute('data-lang', read());

  var css = [
    "",
    ":root{--font-en:'DM Sans','DDC Joyig',sans-serif;--font-dz:'DDC Joyig','Noto Serif Tibetan',sans-serif}",
    '[data-lang="dz"] :is(h1,h2,h3,h4,h5,p,span,a,li,button,label,div,td,th,option){font-family:var(--font-dz)}',
    '[data-lang="dz"] input,[data-lang="dz"] textarea,[data-lang="dz"] select{font-family:var(--font-dz)}',

    /* ── toggle button, same look as index.html's nav toggle ── */
    '.sherig-lang-toggle{display:inline-flex;background:rgba(255,255,255,.07);border:1px solid var(--border);border-radius:20px;overflow:hidden;flex-shrink:0}',
    '.sherig-lang-btn{padding:5px 11px;font-size:.75rem;font-weight:600;color:var(--text2,rgba(255,255,255,.6));background:transparent;border:none;cursor:pointer;transition:background .2s,color .2s;line-height:1.4;font-family:var(--font-en)!important}',
    ".sherig-lang-btn[data-lang-btn='dz']{font-family:'DDC Joyig',sans-serif!important;font-size:.8rem}",
    '.sherig-lang-btn.on{background:var(--gold);color:#1a2340;border-radius:18px}',
    '.sfoot .sherig-lang-toggle{width:100%;justify-content:center;border-radius:4px}',
    '.sfoot .sherig-lang-btn{flex:1;padding:8px 6px}',
    '.sherig-lang-float{position:fixed;top:14px;right:98px;z-index:3000;box-shadow:0 6px 20px rgba(0,0,0,.25);background:var(--surface)}'
  ].join('\n');
  var style = document.createElement('style');
  style.id = 'sherig-lang-css';
  style.textContent = css;
  (document.head || root).appendChild(style);

  function applyLang(l) {
    root.setAttribute('data-lang', l);
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.querySelectorAll('[data-en]').forEach(function (el) {
      var val = el.getAttribute('data-' + l);
      if (!val) return;
      if (el.hasAttribute('placeholder')) { /* handled separately below */ }
      if (val.indexOf('<') >= 0) el.innerHTML = val; else el.textContent = val;
    });
    document.querySelectorAll('[data-en-ph]').forEach(function (el) {
      var val = el.getAttribute('data-' + l + '-ph');
      if (val) el.setAttribute('placeholder', val);
    });
    document.querySelectorAll('.sherig-lang-btn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang-btn') === l);
    });
    window.dispatchEvent(new CustomEvent('sherig:langchange', { detail: { lang: l } }));
  }
  window.sherigApplyLang = applyLang;

  // Translation helper for text built inside JS template strings at
  // render time, e.g. T('Save','སྲུང་བཞག'). Always reflects the
  // CURRENT language — call it at render time, not once and cache it.
  window.T = function (en, dz) { return (root.getAttribute('data-lang') === 'dz' && dz) ? dz : en; };
  window.sherigLang = function () { return root.getAttribute('data-lang'); };

  function makeToggle(extraClass) {
    var wrap = document.createElement('div');
    wrap.className = 'sherig-lang-toggle' + (extraClass ? ' ' + extraClass : '');
    ['en', 'dz'].forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sherig-lang-btn';
      b.setAttribute('data-lang-btn', l);
      b.textContent = l === 'en' ? 'EN' : 'རྫོང་ཁ།';
      b.addEventListener('click', function () { applyLang(l); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function mount() {
    // Unlike the theme toggle, the language toggle only appears where a
    // page explicitly opts in with [data-lang-slot] — no floating
    // fallback, since some pages (e.g. admin.html) don't want it at all.
    var slots = document.querySelectorAll('[data-lang-slot]');
    for (var i = 0; i < slots.length; i++) slots[i].appendChild(makeToggle());
    applyLang(read());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // keep several open tabs / pages in step
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) applyLang(read());
  });

  // Final shared Day Mode visual layer: pure white + Deep Sky Blue gradient. Night mode is untouched.
  (function(){
    var s=document.createElement('style');
    s.id='sherig-day-blue-gradient-final';
    s.textContent=`
/* SherigSpace DAY MODE FINAL PALETTE
   Night mode is intentionally untouched.
   Pure white surfaces + Deep Sky Blue gradient (#00BFFF). */
[data-theme="light"] {
  color-scheme: light;
  --bg:#ffffff !important;
  --surface:#ffffff !important;
  --surface2:#ffffff !important;
  --card-bg:#ffffff !important;
  --card-border:#e7edf3 !important;
  --border:rgba(26,35,64,.10) !important;
  --text:#1a2340 !important;
  --text2:#5b6b7d !important;
  --navy:#1a2340 !important;
  --navy-light:#42566f !important;
  --input-bg:#ffffff !important;
  --gold:#00BFFF !important;
  --gold-light:#54cfff !important;
  --gold-text:#0089c9 !important;
  --gold-soft:rgba(0,191,255,.10) !important;
  --on-accent:#ffffff !important;
  --blue:#007BFF !important;
  --media-bg:#ffffff !important;
  --shadow:0 5px 20px rgba(26,35,64,.07) !important;
  --shadow-hover:0 12px 30px rgba(0,123,255,.16) !important;
}

[data-theme="light"] body,
[data-theme="light"] main,
[data-theme="light"] section,
[data-theme="light"] .main,
[data-theme="light"] .content,
[data-theme="light"] .page,
[data-theme="light"] #about,
[data-theme="light"] footer {
  background:#fff !important;
  color:#1a2340 !important;
}

/* Navigation and sidebars: white, clean, readable */
[data-theme="light"] nav,
[data-theme="light"] .navbar,
[data-theme="light"] .topbar,
[data-theme="light"] .sidebar,
[data-theme="light"] .side-panel {
  background:#fff !important;
  color:#1a2340 !important;
  border-color:#e5ebf1 !important;
  box-shadow:0 2px 12px rgba(26,35,64,.05) !important;
}
[data-theme="light"] .nav-links a,
[data-theme="light"] .side-link,
[data-theme="light"] .sitem,
[data-theme="light"] .topbar a {
  color:#53677d !important;
}
[data-theme="light"] .nav-links a:hover,
[data-theme="light"] .side-link:hover,
[data-theme="light"] .sitem:hover,
[data-theme="light"] .topbar a:hover {
  color:#007BFF !important;
  background:rgba(0,191,255,.06) !important;
}
[data-theme="light"] .side-link.active,
[data-theme="light"] .sitem.on {
  color:#1a2340 !important;
  background:linear-gradient(90deg,rgba(0,191,255,.14),rgba(0,123,255,.05)) !important;
  border-left-color:#00BFFF !important;
}

/* Main branded blue gradient */
[data-theme="light"] .btn,
[data-theme="light"] .btn-primary,
[data-theme="light"] .login-btn,
[data-theme="light"] .gate-btn,
[data-theme="light"] .comment-form button,
[data-theme="light"] .class-tab.active,
[data-theme="light"] .lang-btn.on,
[data-theme="light"] .user-avatar,
[data-theme="light"] .profile-avatar {
  background:linear-gradient(135deg,#00BFFF 0%,#007BFF 100%) !important;
  color:#fff !important;
  border-color:transparent !important;
  box-shadow:0 7px 18px rgba(0,123,255,.20) !important;
}
[data-theme="light"] .btn:hover,
[data-theme="light"] .btn-primary:hover,
[data-theme="light"] .login-btn:hover,
[data-theme="light"] .class-tab.active:hover {
  filter:brightness(.96) !important;
}

/* Class buttons: no visible border */
[data-theme="light"] .class-tab,
[data-theme="light"] .sidebar-classes .class-tab {
  background:#fff !important;
  color:#53677d !important;
  border:0 !important;
  box-shadow:none !important;
}
[data-theme="light"] .class-tab:hover,
[data-theme="light"] .sidebar-classes .class-tab:hover {
  background:rgba(0,191,255,.07) !important;
  color:#007BFF !important;
  border:0 !important;
}
[data-theme="light"] .class-tab.active,
[data-theme="light"] .sidebar-classes .class-tab.active {
  background:linear-gradient(135deg,#00BFFF,#007BFF) !important;
  color:#fff !important;
  border:0 !important;
}

/* Labels, links and small accents */
[data-theme="light"] .section-label,
[data-theme="light"] .section-label *,
[data-theme="light"] .learning-badge,
[data-theme="light"] .sidebar-logo,
[data-theme="light"] .sidebar-classes h6,
[data-theme="light"] .stat-card h3,
[data-theme="light"] .blog-date,
[data-theme="light"] .comment-author,
[data-theme="light"] .gold-text {
  color:#007BFF !important;
}
[data-theme="light"] a { color:#007BFF; }

/* Cards and forms */
[data-theme="light"] .card,
[data-theme="light"] .lesson-card,
[data-theme="light"] .video-card,
[data-theme="light"] .resource-card,
[data-theme="light"] .blog-card,
[data-theme="light"] .stat-card,
[data-theme="light"] .modal-box,
[data-theme="light"] .user-dropdown,
[data-theme="light"] .gate-card {
  background:#fff !important;
  border-color:#e7edf3 !important;
  color:#1a2340 !important;
  box-shadow:0 6px 22px rgba(26,35,64,.07) !important;
}
[data-theme="light"] input,
[data-theme="light"] select,
[data-theme="light"] textarea,
[data-theme="light"] .field input,
[data-theme="light"] .field select,
[data-theme="light"] .field textarea {
  background:#fff !important;
  color:#1a2340 !important;
  border-color:#dfe7ef !important;
}
[data-theme="light"] input:focus,
[data-theme="light"] select:focus,
[data-theme="light"] textarea:focus {
  border-color:#00BFFF !important;
  box-shadow:0 0 0 3px rgba(0,191,255,.10) !important;
}
[data-theme="light"] input::placeholder,
[data-theme="light"] textarea::placeholder { color:#8190a0 !important; }

/* Theme/language/search controls */
[data-theme="light"] .theme-toggle,
[data-theme="light"] .lang-toggle,
[data-theme="light"] .search-btn,
[data-theme="light"] .sherig-theme-btn {
  color:#1a2340 !important;
  background:#fff !important;
  border-color:#dfe7ef !important;
}
[data-theme="light"] .theme-toggle::after { background:#00BFFF !important; }
[data-theme="light"] .search-btn:hover,
[data-theme="light"] .sherig-theme-btn:hover {
  background:rgba(0,191,255,.07) !important;
}

/* Hero / highlighted areas */
[data-theme="light"] .hero-tag {
  background:linear-gradient(135deg,rgba(0,191,255,.12),rgba(0,123,255,.08)) !important;
  color:#007BFF !important;
  border-color:rgba(0,191,255,.22) !important;
}
[data-theme="light"] .hero-title span { color:#007BFF !important; }
[data-theme="light"] .divider { background:linear-gradient(90deg,#00BFFF,#007BFF) !important; }
[data-theme="light"] .stat-card { border-left-color:#00BFFF !important; }
[data-theme="light"] .resource-icon { background:linear-gradient(135deg,rgba(0,191,255,.12),rgba(0,123,255,.08)) !important; }

/* Remove gold/orange hover accents left by page-specific CSS */
[data-theme="light"] .nav-links a::after { background:#00BFFF !important; }
[data-theme="light"] .info-box code,
[data-theme="light"] .comment-item,
[data-theme="light"] .tab { background:rgba(0,191,255,.06) !important; }

/* Footer */
[data-theme="light"] footer { border-top-color:#e7edf3 !important; color:#6f7f90 !important; }

/* Dark overlays remain neutral */
[data-theme="light"] .modal-overlay,
[data-theme="light"] .overlay { background:rgba(26,35,64,.48) !important; }
`;
    (document.head||document.documentElement).appendChild(s);
  })();
})();
