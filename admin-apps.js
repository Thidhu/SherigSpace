/* SherigSpace — Admin → 🛡 Apps
   Adds an "Apps" page to the admin panel with:
     • the device limit for paid memberships
     • per-app rules (Follow settings / Free / Signed-in only / Members only) and "Add an app"
     • usage: opens, people, last opened, "Who opened it?", and "Test" (what each kind of visitor gets)
     • devices: members using too many devices, with a reset button
   Add ONE line to admin.html, anywhere inside <body> near the end:
       <script src="./admin-apps.js"></script>
   Needs APP_CONTROL_SETUP.sql (version 3) to have been run in Supabase. */
(function (win) {
  'use strict';
  var SUPABASE_URL = 'https://kgqlcjdjdhssactfezwi.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtncWxjamRqZGhzc2FjdGZlendpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTE2MzQsImV4cCI6MjA5NTAyNzYzNH0.6hJpg9Zput8wnuDfq7wzb5dRC2KkuRmkmaz870U0Lto';
  var STORAGE_KEY = 'sb-' + (function () { try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch (e) { return ''; } })() + '-auth-token';
  var MODES = [['default', 'Follow the settings (Free Mode)'], ['free', 'Free for everyone'], ['signed_in', 'Signed-in visitors only'], ['members', 'Members only (paid members, teachers, admins, class students)']];
  var data = null;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function token() { try { var s = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || 'null'); if (Array.isArray(s)) s = s[0]; return s && s.access_token ? s.access_token : null; } catch (e) { return null; } }
  function rpc(name, body) {
    var t = token(); if (!t) return Promise.reject(new Error('Please sign in again, then refresh this page.'));
    return win.fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (r) { return r.text().then(function (txt) {
      var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
      if (!r.ok) { var m = (j && j.message) || txt || ('error ' + r.status); if (/does not exist|could not find|PGRST202|42883/i.test(m)) m = 'SETUP'; throw new Error(m); }
      return j;
    }); });
  }
  function el(id) { return win.document.getElementById(id); }
  function msg(text, ok) { var s = el('ap-msg'); if (!s) return; s.style.color = ok === false ? '#e05c5c' : ok ? '#4caf82' : 'var(--text2)'; s.textContent = text || ''; }
  function fail(e) {
    if (e.message === 'SETUP') msg('Run APP_CONTROL_SETUP.sql once in Supabase → SQL Editor, then refresh this page.', false);
    else msg(e.message, false);
  }
  function fmt(d) { return d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'; }

  // ── page + menu ──────────────────────────────────────────────────────────────
  function ensurePage() {
    if (el('p-apps')) return true;
    var settings = el('p-settings'); if (!settings) return false;
    var page = win.document.createElement('div'); page.className = 'page'; page.id = 'p-apps';
    page.innerHTML =
      '<div class="phead"><div><div class="ptitle">Apps &amp; Games</div><div class="psub">Who may open your apps, who is using them, and how many devices each membership uses</div></div></div>' +
      '<div id="ap-msg" style="font-size:.85rem;margin:0 0 .8rem;min-height:1.1rem"></div>' +
      '<div class="card" style="margin-bottom:1rem"><div class="card-head"><h3>📱 Devices per membership</h3></div><div style="padding:1rem 1.2rem;display:flex;gap:.8rem;flex-wrap:wrap;align-items:flex-end">' +
        '<div class="field" style="margin:0"><label>Devices allowed at the same time</label><input id="ap-dev-limit" type="number" min="0" max="20" style="width:120px"/></div>' +
        '<div class="field" style="margin:0"><label>A device counts as "in use" for (minutes)</label><input id="ap-dev-win" type="number" min="5" max="1440" style="width:120px"/></div>' +
        '<button type="button" class="btn btn-gold btn-sm" id="ap-dev-save">Save</button>' +
        '<div style="flex-basis:100%;font-size:.78rem;color:var(--text2)">0 = no limit. Teachers, admins and students in a class are never limited.</div></div></div>' +
      '<div class="card" style="margin-bottom:1rem"><div class="card-head"><h3>🧩 Apps</h3><span class="cbadge" id="ap-count">0</span></div>' +
        '<div style="padding:.2rem 1.2rem .6rem;display:flex;gap:.5rem;flex-wrap:wrap"><input id="ap-new-key" placeholder="app address, e.g. lpgenerator.sherigspace.com" style="flex:1;min-width:220px"/>' +
        '<select id="ap-new-mode" style="width:auto">' + MODES.map(function (m) { return '<option value="' + m[0] + '">' + esc(m[1]) + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="btn btn-gold btn-sm" id="ap-add">＋ Add rule</button></div>' +
        '<div id="ap-list" style="overflow-x:auto;padding:0 .4rem .6rem"></div></div>' +
      '<div class="card" id="ap-dev-card" style="display:none"><div class="card-head"><h3>⚠️ Memberships on many devices (last 7 days)</h3></div><div id="ap-devs" style="padding:.2rem 1.2rem 1rem"></div></div>';
    settings.parentNode.insertBefore(page, settings);
    el('ap-dev-save').onclick = saveDevices;
    el('ap-add').onclick = function () { setRule(el('ap-new-key').value, el('ap-new-mode').value); };
    return true;
  }
  function ensureMenu() {
    if (win.document.querySelector('.sitem[data-apps-menu]')) return;
    var st = win.document.querySelector('.sitem[onclick*="settings"]'); if (!st) return;
    var item = win.document.createElement('div'); item.className = 'sitem'; item.setAttribute('data-apps-menu', '1');
    item.setAttribute('onclick', "go('apps')"); item.innerHTML = '🛡 &nbsp;Apps &amp; Games';
    st.parentNode.insertBefore(item, st);
  }

  // ── data ───────────────────────────────────────────────────────────────────────
  function load() {
    msg('Loading…');
    return rpc('admin_apps_state', { p_days: 30 }).then(function (d) { data = d; draw(); msg(''); }).catch(fail);
  }
  function draw() {
    if (!data) return;
    var s = data.settings || {};
    el('ap-dev-limit').value = s.device_limit || 0; el('ap-dev-win').value = s.device_window_min || 60;
    var ruleOf = {}; (data.rules || []).forEach(function (r) { ruleOf[r.key] = r.mode; });
    var usage = {}; (data.usage || []).forEach(function (u) { usage[u.key] = u; });
    var keys = {}; Object.keys(ruleOf).forEach(function (k) { keys[k] = 1; }); Object.keys(usage).forEach(function (k) { keys[k] = 1; });
    var list = Object.keys(keys).sort();
    el('ap-count').textContent = list.length;
    if (!list.length) { el('ap-list').innerHTML = '<div style="padding:.6rem .4rem;color:var(--text2)">No apps yet. Add one above, or open an app from the site and it will appear here.</div>'; }
    else {
      el('ap-list').innerHTML = '<table class="utbl"><thead><tr><th>App</th><th>Rule</th><th style="text-align:center">Opens (30 days)</th><th style="text-align:center">People</th><th>Last opened</th><th></th></tr></thead><tbody>' +
        list.map(function (k) {
          var u = usage[k] || {}, mode = ruleOf[k] || 'default';
          return '<tr><td><b>' + esc(k) + '</b></td>' +
            '<td><select data-rule="' + esc(k) + '" style="width:auto;max-width:260px">' + MODES.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === mode ? ' selected' : '') + '>' + esc(m[1]) + '</option>'; }).join('') + '</select></td>' +
            '<td style="text-align:center;font-weight:700">' + (u.opens || 0) + '</td><td style="text-align:center">' + (u.people || 0) + '</td>' +
            '<td>' + fmt(u.last_opened) + '</td>' +
            '<td style="white-space:nowrap"><button type="button" class="btn btn-ghost btn-sm" data-who="' + esc(k) + '">👥 Who?</button> <button type="button" class="btn btn-ghost btn-sm" data-test="' + esc(k) + '">🧪 Test</button></td></tr>';
        }).join('') + '</tbody></table>';
      Array.prototype.forEach.call(el('ap-list').querySelectorAll('select[data-rule]'), function (sel) { sel.onchange = function () { setRule(sel.getAttribute('data-rule'), sel.value); }; });
      Array.prototype.forEach.call(el('ap-list').querySelectorAll('button[data-who]'), function (b) { b.onclick = function () { who(b.getAttribute('data-who')); }; });
      Array.prototype.forEach.call(el('ap-list').querySelectorAll('button[data-test]'), function (b) { b.onclick = function () { test(b.getAttribute('data-test')); }; });
    }
    var du = data.device_users || [];
    el('ap-dev-card').style.display = du.length ? '' : 'none';
    el('ap-devs').innerHTML = du.map(function (x) {
      return '<div style="display:flex;justify-content:space-between;gap:.8rem;flex-wrap:wrap;align-items:center;padding:.5rem 0;border-bottom:1px dashed var(--border)"><span><b>' + esc(x.name || '—') + '</b> <small style="color:var(--text2)">' + esc(x.email || '') + '</small><div style="font-size:.76rem;color:var(--text2)">' + x.devices + ' devices · last seen ' + fmt(x.last_seen) + '</div></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-reset="' + esc(x.user_id) + '">Reset devices</button></div>';
    }).join('');
    Array.prototype.forEach.call(el('ap-devs').querySelectorAll('button[data-reset]'), function (b) {
      b.onclick = function () { if (!win.confirm('Forget this person\'s devices? They can then use their membership on up to the limit again.')) return; rpc('admin_app_reset_devices', { p_user: b.getAttribute('data-reset') }).then(function () { msg('Devices reset ✓', true); return load(); }).catch(fail); };
    });
  }

  // ── actions ─────────────────────────────────────────────────────────────────────
  function setRule(key, mode) {
    key = String(key || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!key) { msg('Please type the app address first.', false); return; }
    msg('Saving…');
    rpc('admin_set_app_rule', { p_key: key, p_mode: mode }).then(function () { msg('Saved ✓ ' + key + ' — applies within about a minute.', true); el('ap-new-key').value = ''; return load(); }).catch(fail);
  }
  function saveDevices() {
    var lim = parseInt(el('ap-dev-limit').value, 10), win2 = parseInt(el('ap-dev-win').value, 10);
    msg('Saving…');
    rpc('admin_set_device_limit', { p_limit: isNaN(lim) ? 0 : lim, p_window_min: isNaN(win2) ? 60 : win2 }).then(function () { msg('Saved ✓', true); return load(); }).catch(fail);
  }
  function who(key) {
    rpc('admin_app_people', { p_key: key, p_days: 30 }).then(function (r) {
      var rows = (r.people || []).map(function (p) { return '<tr><td><b>' + esc(p.name || '—') + '</b><div style="font-size:.72rem;color:var(--text2)">' + esc(p.email || '') + '</div></td><td style="text-align:center">' + p.opens + '</td><td>' + fmt(p.last_opened) + '</td></tr>'; }).join('');
      show('👥 Who opened ' + key, (rows ? '<table class="utbl"><thead><tr><th>Person</th><th>Opens</th><th>Last</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p style="color:var(--text2)">Nobody signed in has opened it in the last 30 days.</p>') +
        '<p style="font-size:.8rem;color:var(--text2);margin-top:.8rem">Signed-out visits: ' + (r.signed_out_opens || 0) + '</p>');
    }).catch(fail);
  }
  function test(key) {
    rpc('admin_app_preview', { p_key: key }).then(function (r) {
      var rows = (r.visitors || []).map(function (v) {
        var ok = v.result === 'opens' || v.result === 'opens (free)';
        return '<tr><td>' + esc(v.who) + '</td><td style="font-weight:700;color:' + (ok ? '#4caf82' : (v.result === 'asked to sign in' ? '#e8a317' : '#e05c5c')) + '">' + esc(v.result) + '</td></tr>';
      }).join('');
      show('🧪 Test ' + key, '<p style="font-size:.85rem;color:var(--text2)">' + (r.protect ? 'Protected · who may open: ' + (r.audience === 'signed_in' ? 'anyone signed in' : 'paid members, teachers, admins and class students') : 'Not protected (open to everyone)') + '</p>' +
        '<table class="utbl"><thead><tr><th>Visitor</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<p style="font-size:.78rem;color:var(--text2);margin-top:.7rem">Examples use real accounts from your database. Nothing is changed by this test.</p>');
    }).catch(fail);
  }
  function show(title, html) {
    var old = el('ap-modal'); if (old) old.remove();
    var ov = win.document.createElement('div'); ov.id = 'ap-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:1rem';
    ov.innerHTML = '<div style="background:var(--surface,#1a2340);color:var(--text,#e8e4dc);border-radius:16px;max-width:620px;width:100%;max-height:88vh;overflow:auto;padding:1.2rem 1.3rem;box-shadow:0 20px 60px rgba(0,0,0,.4)"><h3 style="margin:0 0 .7rem">' + esc(title) + '</h3>' + html + '<div style="text-align:right;margin-top:1rem"><button type="button" class="btn btn-gold btn-sm">Close</button></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.tagName === 'BUTTON') ov.remove(); });
    win.document.body.appendChild(ov);
  }

  // ── wire into admin.html ─────────────────────────────────────────────────────────
  function install() {
    if (!ensurePage() || typeof win.go !== 'function') return false;
    ensureMenu();
    if (!win.__apGoWrapped) {
      var original = win.go; win.__apGoWrapped = true;
      win.go = function (p) { var r = original.apply(this, arguments); if (p === 'apps') { ensureMenu(); load(); } return r; };
    }
    return true;
  }
  if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', install); else install();
  // admin.html defines go() in its own script; if it is not ready yet, try again shortly
  if (!win.__apRetry) { win.__apRetry = true; var n = 0, t = win.setInterval(function () { if (install() || ++n > 30) win.clearInterval(t); }, 300); }
  win.SherigAppsAdmin = { load: load, test: test, who: who };
})(window);
