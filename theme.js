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
    "@font-face{font-family:'ThinWangTJoyig';src:url('ThinWangTJoyig-Regular.ttf') format('truetype');font-weight:normal;font-style:normal;font-display:swap}",
    ":root{--font-en:'DM Sans',sans-serif;--font-dz:'ThinWangTJoyig','Noto Serif Tibetan',sans-serif}",
    '[data-lang="dz"] :is(h1,h2,h3,h4,h5,p,span,a,li,button,label,div,td,th,option){font-family:var(--font-dz)}',
    '[data-lang="dz"] input,[data-lang="dz"] textarea,[data-lang="dz"] select{font-family:var(--font-dz)}',

    /* ── toggle button, same look as index.html's nav toggle ── */
    '.sherig-lang-toggle{display:inline-flex;background:rgba(255,255,255,.07);border:1px solid var(--border);border-radius:20px;overflow:hidden;flex-shrink:0}',
    '.sherig-lang-btn{padding:5px 11px;font-size:.75rem;font-weight:600;color:var(--text2,rgba(255,255,255,.6));background:transparent;border:none;cursor:pointer;transition:background .2s,color .2s;line-height:1.4;font-family:var(--font-en)!important}',
    ".sherig-lang-btn[data-lang-btn='dz']{font-family:'ThinWangTJoyig',sans-serif!important;font-size:.8rem}",
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
})();
