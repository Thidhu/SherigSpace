/* SherigSpace — Admin → Settings → "Apps & games protection"
   Adds one card under "Free Mode" so you can control app protection from the admin page.
   Add ONE line to admin.html (anywhere inside <body>, after the Settings page):
       <script src="./admin-app-control.js"></script>
   Needs APP_CONTROL_SETUP.sql to have been run once in Supabase. */
(function (win) {
  'use strict';
  var SUPABASE_URL = 'https://kgqlcjdjdhssactfezwi.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtncWxjamRqZGhzc2FjdGZlendpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTE2MzQsImV4cCI6MjA5NTAyNzYzNH0.6hJpg9Zput8wnuDfq7wzb5dRC2KkuRmkmaz870U0Lto';
  var STORAGE_KEY = 'sb-' + (function () { try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch (e) { return ''; } })() + '-auth-token';
  var state = { free_mode: true, app_protection: 'follow_free_mode', app_audience: 'members' };

  function token() { try { var s = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || 'null'); if (Array.isArray(s)) s = s[0]; return s && s.access_token ? s.access_token : null; } catch (e) { return null; } }
  function api(method, path, body) {
    var t = token(); if (!t) return Promise.reject(new Error('Please sign in again, then refresh this page.'));
    return win.fetch(SUPABASE_URL + '/rest/v1/site_settings' + path, {
      method: method, headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  function el(id) { return win.document.getElementById(id); }

  function summary() {
    var prot = state.app_protection === 'always' ? true : state.app_protection === 'never' ? false : !state.free_mode;
    var who = state.app_audience === 'signed_in' ? 'anyone who is signed in' : 'paid members, teachers, admins and students in a teacher\'s class';
    var why = state.app_protection === 'follow_free_mode' ? (state.free_mode ? 'Free Mode is ON' : 'Free Mode is OFF') : (state.app_protection === 'always' ? 'you chose "Always protect"' : 'you chose "Never protect"');
    return prot
      ? '🔒 <b>Right now apps are PROTECTED</b> (' + why + '). They open only inside sherigspace.com, for ' + who + '. A copied link shows "Permission denied".'
      : '🔓 <b>Right now apps are OPEN to everyone</b> (' + why + '). A copied app link works in any browser.';
  }
  function paint() {
    var box = el('s-appprot-summary'); if (box) box.innerHTML = summary();
    var radios = win.document.querySelectorAll('input[name="s-appprot"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === state.app_protection;
    var sel = el('s-appaud'); if (sel) sel.value = state.app_audience;
    var note = el('s-appaud-note'); if (note) note.style.opacity = (state.app_protection === 'never' || (state.app_protection === 'follow_free_mode' && state.free_mode)) ? '.55' : '1';
  }
  function status(msg, ok) { var s = el('s-appprot-status'); if (!s) return; s.style.color = ok === false ? '#e05c5c' : ok ? '#4caf82' : 'var(--text2)'; s.textContent = msg || ''; }

  function load() {
    return api('GET', '?id=eq.1&select=free_mode,app_protection,app_audience').then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { status(/app_protection|column|schema/i.test(JSON.stringify(x.j)) ? 'Run APP_CONTROL_SETUP.sql once in Supabase → SQL Editor, then refresh this page.' : 'Could not load: ' + ((x.j && x.j.message) || ''), false); return; }
        var row = x.j && x.j[0]; if (!row) return;
        if (typeof row.free_mode === 'boolean') state.free_mode = row.free_mode;
        if (row.app_protection) state.app_protection = row.app_protection;
        if (row.app_audience) state.app_audience = row.app_audience;
        paint();
      }).catch(function (e) { status(e.message, false); });
  }
  function save() {
    var radio = win.document.querySelector('input[name="s-appprot"]:checked');
    var payload = { app_protection: radio ? radio.value : state.app_protection, app_audience: el('s-appaud').value, updated_at: new Date().toISOString() };
    status('Saving…');
    api('PATCH', '?id=eq.1', payload).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
      if (!x.ok) { status(/app_protection|app_audience|column|schema/i.test(JSON.stringify(x.j)) ? 'Not saved — run APP_CONTROL_SETUP.sql once in Supabase → SQL Editor, then try again.' : 'Could not save: ' + ((x.j && x.j.message) || ''), false); return; }
      state.app_protection = payload.app_protection; state.app_audience = payload.app_audience; paint();
      status('Saved ✓ The new rule applies to every app within about a minute.', true);
    }).catch(function (e) { status(e.message, false); });
  }

  function build() {
    var fm = el('s-freemode'); if (!fm || el('s-appprot-card')) return false;
    var host = fm.closest ? fm.closest('.card') : null; if (!host || !host.parentNode) return false;
    var card = win.document.createElement('div'); card.className = 'card'; card.id = 's-appprot-card';
    card.innerHTML =
      '<div class="card-head"><h3>🔒 Apps &amp; games protection</h3></div>' +
      '<div style="padding:1.4rem;display:flex;flex-direction:column;gap:.9rem">' +
        '<p style="font-size:.85rem;color:var(--text2);line-height:1.6;margin:0">Controls the apps and games hosted on GitHub (for example <i>lpgenerator.sherigspace.com</i>). It follows <b>Free Mode</b> by default, so when you turn Free Mode off, the apps stop being free.</p>' +
        '<label style="display:flex;gap:.6rem;align-items:flex-start;cursor:pointer"><input type="radio" name="s-appprot" value="follow_free_mode" style="margin-top:.25rem"/><span><b>Follow Free Mode</b> (recommended)<br><small style="color:var(--text2)">Free Mode ON → apps open for everyone. Free Mode OFF → apps are protected.</small></span></label>' +
        '<label style="display:flex;gap:.6rem;align-items:flex-start;cursor:pointer"><input type="radio" name="s-appprot" value="always" style="margin-top:.25rem"/><span><b>Always protect</b><br><small style="color:var(--text2)">Protected even while Free Mode is ON.</small></span></label>' +
        '<label style="display:flex;gap:.6rem;align-items:flex-start;cursor:pointer"><input type="radio" name="s-appprot" value="never" style="margin-top:.25rem"/><span><b>Never protect</b><br><small style="color:var(--text2)">Apps open everywhere, for everyone, even when Free Mode is OFF.</small></span></label>' +
        '<div id="s-appaud-note"><div class="field" style="margin:0"><label>When protected, who can open an app?</label>' +
          '<select id="s-appaud"><option value="members">Paid members, teachers, admins and students in a teacher\'s class</option><option value="signed_in">Anyone who is signed in</option></select></div></div>' +
        '<div id="s-appprot-summary" style="font-size:.85rem;line-height:1.6;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.35);border-radius:10px;padding:.7rem .9rem"></div>' +
        '<div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap"><button type="button" id="s-appprot-save" class="btn btn-gold">Save</button><span id="s-appprot-status" style="font-size:.82rem"></span></div>' +
      '</div>';
    host.parentNode.insertBefore(card, host.nextSibling);
    el('s-appprot-save').onclick = save;
    var radios = card.querySelectorAll('input[name="s-appprot"]');
    for (var i = 0; i < radios.length; i++) radios[i].onchange = function () { state.app_protection = this.value; paint(); };
    el('s-appaud').onchange = function () { state.app_audience = this.value; paint(); };
    // when you flip Free Mode, refresh this card's "Right now" line
    fm.addEventListener('change', function () { win.setTimeout(load, 900); });
    paint(); load();
    return true;
  }
  function start() { if (!build()) { var n = 0, t = win.setInterval(function () { if (build() || ++n > 20) win.clearInterval(t); }, 500); } }
  if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', start); else start();
  win.SherigAppControl = { _summary: summary, _state: state };
})(window);
