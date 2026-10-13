// ── Link list manager for SherigSpace ──
// Used by admin.html (public "Quick Links" shown on the home page) and by
// teacher.html ("My Shortcuts", private to each teacher).
//
//   const mgr = mountLinkManager(el, { supabase, table:'quick_links', onError: msg => toast(msg, true) });
//   mgr.reload();
//
// Each row: { id, title, url, sort_order, created_at }. Adding is by paste:
// one link per line, either   Title | https://…   or just   https://…

import { esc, safeUrl } from './config.js';

export function iconFor(url){
  const u = String(url || '').toLowerCase();
  if(/drive\.google\.com\/drive|drive\.google\.com\/file|drive\.google\.com\/open/.test(u)) return '📁';
  if(/docs\.google\.com\/document/.test(u)) return '📄';
  if(/docs\.google\.com\/spreadsheets/.test(u)) return '📊';
  if(/docs\.google\.com\/presentation/.test(u)) return '📽️';
  if(/forms\.gle|docs\.google\.com\/forms/.test(u)) return '📝';
  if(/classroom\.google\.com/.test(u)) return '🏫';
  if(/meet\.google\.com|zoom\.us|teams\.microsoft/.test(u)) return '🎥';
  if(/youtube\.com|youtu\.be/.test(u)) return '▶️';
  if(/facebook\.com|messenger\.com|t\.me|wa\.me|whatsapp/.test(u)) return '💬';
  if(/\.pdf(\?|$)/.test(u)) return '📕';
  return '🔗';
}

function normalizeUrl(raw){
  let u = String(raw || '').trim();
  if(!u) return '';
  if(!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;     // "drive.google.com/…" → https://…
  return safeUrl(u) || '';                                    // only http(s) survives
}

// "Title | url" or "url" per line → [{ title, url }]
export function parseLinkLines(text){
  const out = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if(!line) return;
    let title = '', url = line;
    const bar = line.lastIndexOf('|');
    if(bar > -1){ title = line.slice(0, bar).trim(); url = line.slice(bar + 1).trim(); }
    else {
      const m = line.match(/^(.*?)\s+(https?:\/\/\S+)$/i);   // "Title https://…"
      if(m){ title = m[1].trim(); url = m[2]; }
    }
    url = normalizeUrl(url);
    if(!url) return;
    if(!title){ try{ title = new URL(url).hostname.replace(/^www\./, ''); }catch(e){ title = url; } }
    out.push({ title: title.slice(0, 80), url });
  });
  return out;
}

const CSS = `
.ll-add{padding:1rem 1.4rem;border-bottom:1px solid var(--border,rgba(127,127,127,.25));display:flex;flex-direction:column;gap:.55rem}
.ll-add textarea{width:100%;min-height:84px;resize:vertical;padding:.6rem .75rem;border:1px solid var(--border,rgba(127,127,127,.3));border-radius:8px;background:var(--input-bg,var(--bg,transparent));color:var(--text,inherit);font-family:inherit;font-size:.88rem;line-height:1.5}
.ll-hint{font-size:.76rem;color:var(--text2,#667);line-height:1.5}
.ll-row{display:flex;align-items:center;gap:.8rem;padding:.7rem 1.4rem;border-bottom:1px solid var(--border,rgba(127,127,127,.18))}
.ll-row:last-child{border-bottom:none}
.ll-ico{font-size:1.3rem;flex:none;width:1.8rem;text-align:center}
.ll-main{flex:1;min-width:0}
.ll-title{font-weight:600;font-size:.9rem;word-break:break-word}
.ll-url{font-size:.74rem;color:var(--text2,#667);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ll-btns{display:flex;gap:.3rem;flex:none}
.ll-btns button,.ll-btns a{border:1px solid var(--border,rgba(127,127,127,.3));background:transparent;color:var(--text2,#667);border-radius:6px;padding:4px 9px;font-size:.78rem;cursor:pointer;text-decoration:none;font-family:inherit}
.ll-btns button:hover,.ll-btns a:hover{border-color:var(--gold,#00bfff)}
.ll-btns button[data-act=del]:hover{border-color:var(--red,#d9534f);color:var(--red,#d9534f)}
.ll-btns button:disabled{opacity:.35;cursor:default}
.ll-empty{padding:1.4rem;text-align:center;font-size:.85rem;color:var(--text2,#667)}
`;

export function mountLinkManager(root, opts){
  const { supabase, table } = opts;
  const onError = opts.onError || (m => alert(m));
  const hasOwner = !!opts.ownerColumn;     // teacher_shortcuts rows carry teacher_id (filled by the database default)
  let rows = [];

  if(!document.getElementById('ll-css')){
    const s = document.createElement('style'); s.id = 'll-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  root.innerHTML = `
    <div class="ll-add">
      <textarea data-paste placeholder="${esc(opts.placeholder || 'Paste links here, one per line:\nGoogle Drive | https://drive.google.com/…\nhttps://docs.google.com/…')}"></textarea>
      <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn btn-gold btn-sm" data-add>＋ Add links</button>
        <span class="ll-hint">One per line. Write <b>Name | link</b> to give it a name, or paste just the link.</span>
      </div>
    </div>
    <div data-list><div class="ll-empty">Loading…</div></div>`;
  const listEl = root.querySelector('[data-list]'), pasteEl = root.querySelector('[data-paste]');

  function setupMissing(){
    listEl.innerHTML = `<div class="ll-empty">${esc(opts.setupMessage || 'Not set up yet. Run QUICKLINKS_SETUP.sql once in Supabase → SQL Editor, then reload.')}</div>`;
  }

  function render(){
    if(!rows.length){ listEl.innerHTML = `<div class="ll-empty">${esc(opts.emptyText || 'No links yet.')}</div>`; return; }
    listEl.innerHTML = rows.map((r, i) => `
      <div class="ll-row">
        <div class="ll-ico">${iconFor(r.url)}</div>
        <div class="ll-main"><div class="ll-title">${esc(r.title)}</div><div class="ll-url">${esc(r.url)}</div></div>
        <div class="ll-btns">
          <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" title="Open">↗</a>
          <button type="button" data-act="up" data-id="${esc(r.id)}" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" data-act="down" data-id="${esc(r.id)}" title="Move down" ${i === rows.length - 1 ? 'disabled' : ''}>▼</button>
          <button type="button" data-act="edit" data-id="${esc(r.id)}" title="Rename">✏</button>
          <button type="button" data-act="del" data-id="${esc(r.id)}" title="Delete">🗑</button>
        </div>
      </div>`).join('');
  }

  async function reload(){
    let q = supabase.from(table).select('id,title,url,sort_order,created_at');
    if(hasOwner){
      const { data: { session } } = await supabase.auth.getSession();
      if(session && session.user) q = q.eq(opts.ownerColumn, session.user.id);
    }
    const { data, error } = await q.order('sort_order', { ascending:true, nullsFirst:false }).order('created_at', { ascending:true });
    if(error){ if(error.code === '42P01' || /does not exist|schema cache|Could not find/i.test(error.message)) setupMissing(); else onError(error.message); return; }
    rows = data || [];
    render();
  }

  async function add(){
    const items = parseLinkLines(pasteEl.value);
    if(!items.length){ onError('Paste at least one link (it must start with http:// or https://, or look like drive.google.com/…).'); return; }
    let next = rows.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0);
    const payload = items.map(it => ({ title: it.title, url: it.url, sort_order: ++next }));
    const { error } = await supabase.from(table).insert(payload);
    if(error){ onError(error.message); return; }
    pasteEl.value = '';
    await reload();
  }

  async function renumber(list){
    const changed = list.map((r, i) => ({ id:r.id, n:i + 1, old:r.sort_order })).filter(x => x.n !== x.old);
    for(const c of changed){
      const { error } = await supabase.from(table).update({ sort_order: c.n }).eq('id', c.id);
      if(error){ onError(error.message); break; }
    }
    await reload();
  }

  root.addEventListener('click', async e => {
    if(e.target.closest('[data-add]')){ add(); return; }
    const b = e.target.closest('[data-act]'); if(!b) return;
    const id = b.dataset.id, i = rows.findIndex(r => String(r.id) === String(id)); if(i < 0) return;
    if(b.dataset.act === 'del'){
      if(!confirm('Delete "' + rows[i].title + '"?')) return;
      const { error } = await supabase.from(table).delete().eq('id', id);
      if(error){ onError(error.message); return; }
      await reload();
    } else if(b.dataset.act === 'edit'){
      const t = prompt('Name for this link:', rows[i].title);
      if(t === null || !t.trim()) return;
      const { error } = await supabase.from(table).update({ title: t.trim().slice(0, 80) }).eq('id', id);
      if(error){ onError(error.message); return; }
      await reload();
    } else if(b.dataset.act === 'up' || b.dataset.act === 'down'){
      const j = i + (b.dataset.act === 'up' ? -1 : 1);
      if(j < 0 || j >= rows.length) return;
      const list = [...rows]; [list[i], list[j]] = [list[j], list[i]];
      await renumber(list);
    }
  });

  reload();
  return { reload };
}
