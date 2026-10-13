// ── Class chat for SherigSpace ──
// Used by student.html (role 'student') and teacher.html (role 'teacher').
// One shared room per class. Text only. The teacher can delete any message and mute a student;
// a student can delete only their own. Who sent a message is filled in by the database
// (see CHAT_SETUP.sql), never by the page.
//
//   const chat = mountClassChat(element, { supabase, classId, role: 'student', muted: false });
//   chat.destroy();   // stops the refresh timer / live connection

import { esc } from './config.js';

const POLL_MS = 6000;      // safety refresh, in case the live connection drops
const MAX_LEN = 500;

const CSS = `
.cc{display:flex;flex-direction:column;gap:.6rem}
.cc-note{font-size:.78rem;line-height:1.5;color:var(--text2,#667);background:rgba(127,127,127,.09);border-radius:8px;padding:.5rem .75rem}
.cc-list{height:min(52vh,460px);min-height:240px;overflow-y:auto;border:1px solid var(--border,rgba(127,127,127,.25));border-radius:10px;padding:.7rem;display:flex;flex-direction:column;gap:.5rem;background:var(--input-bg,transparent)}
.cc-empty{margin:auto;text-align:center;color:var(--text2,#667);font-size:.85rem;padding:1rem}
.cc-day{align-self:center;font-size:.7rem;color:var(--text2,#667);background:rgba(127,127,127,.12);border-radius:99px;padding:1px 10px}
.cc-msg{max-width:84%;align-self:flex-start;background:rgba(127,127,127,.13);border-radius:12px 12px 12px 4px;padding:.45rem .7rem}
.cc-msg.mine{align-self:flex-end;background:var(--gold-soft,rgba(0,191,255,.13));border-radius:12px 12px 4px 12px}
.cc-msg.teacher{border:1px solid var(--gold,#00bfff)}
.cc-meta{display:flex;gap:.45rem;align-items:baseline;flex-wrap:wrap;font-size:.7rem;color:var(--text2,#667)}
.cc-meta b{color:var(--text,inherit);font-size:.78rem;font-weight:700}
.cc-badge{font-size:.62rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--gold-text,var(--gold,#0089c9))}
.cc-body{font-size:.9rem;line-height:1.5;word-break:break-word;overflow-wrap:anywhere;color:var(--text,inherit)}
.cc-acts{display:flex;gap:.7rem;margin-top:.2rem}
.cc-acts button{background:none;border:none;padding:0;font:inherit;font-size:.7rem;color:var(--text2,#667);cursor:pointer;text-decoration:underline}
.cc-acts button:hover{color:var(--red,#d9534f)}
.cc-compose{display:flex;gap:.5rem;align-items:flex-end}
.cc-compose textarea{flex:1;resize:none;min-height:42px;max-height:120px;padding:.55rem .7rem;border:1px solid var(--border,rgba(127,127,127,.3));border-radius:10px;background:var(--input-bg,var(--bg,transparent));color:var(--text,inherit);font-family:inherit;font-size:.92rem;line-height:1.4}
.cc-compose textarea:disabled{opacity:.6;cursor:not-allowed}
.cc-send{padding:.6rem 1.1rem;border:none;border-radius:10px;background:var(--gold,#00bfff);color:var(--on-accent,#1a2340);font-family:inherit;font-weight:700;font-size:.88rem;cursor:pointer}
.cc-send:disabled{opacity:.55;cursor:not-allowed}
.cc-foot{display:flex;justify-content:space-between;gap:.5rem;font-size:.72rem;color:var(--text2,#667);min-height:1.1em}
.cc-status.err{color:var(--red,#d9534f)}
.cc-mutes{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;font-size:.75rem;color:var(--text2,#667)}
.cc-chip{display:inline-flex;align-items:center;gap:.35rem;border:1px solid var(--border,rgba(127,127,127,.3));border-radius:99px;padding:2px 4px 2px 10px}
.cc-chip button{border:none;background:rgba(127,127,127,.18);border-radius:99px;font:inherit;font-size:.7rem;padding:1px 8px;cursor:pointer;color:inherit}
`;

function addCss(){
  if(document.getElementById('cc-css')) return;
  const s = document.createElement('style');
  s.id = 'cc-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

const FIELDS = 'id,sender_id,sender_name,sender_role,body,created_at';

function friendlyError(error){
  const m = String((error && error.message) || error || '');
  if(error && (error.code === '42P01' || /does not exist|schema cache|Could not find/i.test(m)))
    return { setup:true, text:'Class chat is not set up yet (run CHAT_SETUP.sql in Supabase).' };
  if(error && (error.code === '42501' || /row-level security|permission denied/i.test(m)))
    return { text:'Chat is switched off for this class right now, or your teacher has paused your chat.' };
  return { text: m || 'Something went wrong. Please try again.' };
}

function timeLabel(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}
function dayLabel(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  const today = new Date();
  if(d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(today.getTime() - 864e5);
  if(d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day:'numeric', month:'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function mountClassChat(root, opts){
  addCss();
  const { supabase, classId, role } = opts;
  const isTeacher = role === 'teacher';

  let myId = null, destroyed = false, broken = false, sending = false, channel = null, timer = null;
  let msgs = [];                 // oldest → newest
  let mutedIds = new Set();      // teacher: every muted student in this class · student: just me, if muted
  let iMuted = !!opts.muted;
  let names = {};                // teacher: student_id → display name
  let sig = '';

  root.innerHTML = `
    <div class="cc">
      <div class="cc-note">${isTeacher
        ? '👀 You can see everything written here. Delete any message, or mute a student to stop them posting.'
        : '💬 This is a chat for your class only. Your teacher can read it. Be kind and respectful.'}</div>
      ${isTeacher ? '<div class="cc-mutes" data-mutes></div>' : ''}
      <div class="cc-list" data-list><div class="cc-empty">Loading…</div></div>
      <div class="cc-compose">
        <textarea data-input rows="1" maxlength="${MAX_LEN}" placeholder="Write a message…" aria-label="Write a message"></textarea>
        <button type="button" class="cc-send" data-send>Send</button>
      </div>
      <div class="cc-foot"><span class="cc-status" data-status></span><span data-count>0/${MAX_LEN}</span></div>
    </div>`;

  const $ = sel => root.querySelector(sel);
  const listEl = $('[data-list]'), input = $('[data-input]'), sendBtn = $('[data-send]'),
        statusEl = $('[data-status]'), countEl = $('[data-count]'), mutesEl = $('[data-mutes]');

  function setStatus(text, isErr){ statusEl.textContent = text || ''; statusEl.classList.toggle('err', !!isErr); }

  function applyComposerState(){
    const blocked = !isTeacher && iMuted;
    input.disabled = blocked; sendBtn.disabled = blocked || sending;
    input.placeholder = blocked ? 'Your teacher has paused your chat for now.' : 'Write a message…';
  }

  function render(){
    if(destroyed) return;
    const stick = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 90;
    if(!msgs.length){
      listEl.innerHTML = '<div class="cc-empty">No messages yet. Say hello! 👋</div>';
    } else {
      let html = '', lastDay = '';
      for(const m of msgs){
        const day = dayLabel(m.created_at);
        if(day !== lastDay){ html += `<div class="cc-day">${esc(day)}</div>`; lastDay = day; }
        const mine = m.sender_id === myId;
        const byTeacher = m.sender_role === 'teacher';
        const canDelete = mine || isTeacher;
        const canMute = isTeacher && !byTeacher && !mine && !mutedIds.has(m.sender_id);
        html += `<div class="cc-msg${mine ? ' mine' : ''}${byTeacher ? ' teacher' : ''}" data-id="${esc(m.id)}">
          <div class="cc-meta"><b>${esc(mine ? 'You' : (m.sender_name || 'Student'))}</b>${byTeacher ? '<span class="cc-badge">Teacher</span>' : ''}<span>${esc(timeLabel(m.created_at))}</span></div>
          <div class="cc-body">${esc(m.body).replace(/\n/g, '<br>')}</div>
          ${(canDelete || canMute) ? `<div class="cc-acts">${canDelete ? `<button type="button" data-act="del" data-id="${esc(m.id)}">Delete</button>` : ''}${canMute ? `<button type="button" data-act="mute" data-sid="${esc(m.sender_id)}">Mute ${esc(m.sender_name || 'student')}</button>` : ''}</div>` : ''}
        </div>`;
      }
      listEl.innerHTML = html;
    }
    if(stick) listEl.scrollTop = listEl.scrollHeight;

    if(mutesEl){
      const ids = [...mutedIds];
      mutesEl.innerHTML = ids.length
        ? '🔇 Muted: ' + ids.map(id => `<span class="cc-chip">${esc(names[id] || 'Student')}<button type="button" data-act="unmute" data-sid="${esc(id)}">Unmute</button></span>`).join('')
        : '';
    }
    applyComposerState();
  }

  function makeSig(){ return msgs.map(m => m.id).join(',') + '|' + [...mutedIds].sort().join(',') + '|' + iMuted; }

  async function fetchMutes(){
    const { data, error } = await supabase.from('class_chat_mutes').select('student_id').eq('class_id', classId);
    if(error) return;                       // not fatal
    const ids = (data || []).map(r => r.student_id);
    if(isTeacher) mutedIds = new Set(ids);
    else { iMuted = ids.length > 0; mutedIds = new Set(iMuted ? [myId] : []); }
  }

  async function fetchNames(){
    if(!isTeacher) return;
    const { data } = await supabase.from('class_students').select('student_id,display_name').eq('class_id', classId);
    (data || []).forEach(r => { if(r.student_id) names[r.student_id] = r.display_name || 'Student'; });
  }

  async function refresh(){
    if(destroyed) return;
    const { data, error } = await supabase.from('class_messages').select(FIELDS)
      .eq('class_id', classId).order('created_at', { ascending:false }).limit(100);
    if(destroyed) return;
    if(error){
      const fe = friendlyError(error);
      if(fe.setup){ listEl.innerHTML = `<div class="cc-empty">${esc(fe.text)}</div>`; input.disabled = true; sendBtn.disabled = true; broken = true; stop(); }
      else setStatus(fe.text, true);
      return;
    }
    msgs = (data || []).reverse();
    await fetchMutes();
    const s = makeSig();
    if(s !== sig){ sig = s; render(); }
  }

  function addMsg(m){
    if(!m || !m.id || msgs.some(x => x.id === m.id)) return;
    msgs.push({ id:m.id, sender_id:m.sender_id, sender_name:m.sender_name, sender_role:m.sender_role, body:m.body, created_at:m.created_at });
    msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if(msgs.length > 100) msgs = msgs.slice(-100);
    sig = makeSig(); render();
  }
  function removeMsg(id){
    const n = msgs.length;
    msgs = msgs.filter(m => m.id !== id);
    if(msgs.length !== n){ sig = makeSig(); render(); }
  }

  async function send(){
    const body = input.value.trim();
    if(!body || sending || (!isTeacher && iMuted)) return;
    sending = true; sendBtn.disabled = true; setStatus('');
    const { data, error } = await supabase.from('class_messages').insert({ class_id: classId, body }).select(FIELDS).single();
    sending = false; applyComposerState();
    if(error){ setStatus(friendlyError(error).text, true); return; }
    input.value = ''; countEl.textContent = '0/' + MAX_LEN; input.style.height = '';
    addMsg(data);
    listEl.scrollTop = listEl.scrollHeight;
    input.focus();
  }

  async function onClick(e){
    const b = e.target.closest('[data-act]');
    if(!b || !root.contains(b)) return;
    const act = b.dataset.act;
    if(act === 'del'){
      if(!confirm('Delete this message?')) return;
      const id = b.dataset.id;
      const { error } = await supabase.from('class_messages').delete().eq('id', id);
      if(error){ setStatus(friendlyError(error).text, true); return; }
      removeMsg(id);
    } else if(act === 'mute'){
      const sid = b.dataset.sid;
      if(!confirm('Mute this student? They will still see the chat but cannot post until you unmute them.')) return;
      const { error } = await supabase.from('class_chat_mutes').upsert({ class_id: classId, student_id: sid }, { onConflict:'class_id,student_id', ignoreDuplicates:true });
      if(error){ setStatus(friendlyError(error).text, true); return; }
      mutedIds.add(sid); sig = makeSig(); render();
    } else if(act === 'unmute'){
      const sid = b.dataset.sid;
      const { error } = await supabase.from('class_chat_mutes').delete().eq('class_id', classId).eq('student_id', sid);
      if(error){ setStatus(friendlyError(error).text, true); return; }
      mutedIds.delete(sid); sig = makeSig(); render();
    }
  }

  function onKey(e){
    if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); send(); }
  }
  function onInput(){
    countEl.textContent = input.value.length + '/' + MAX_LEN;
    input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  function tick(){
    if(destroyed) return;
    if(!root.isConnected){ destroy(); return; }
    if(document.hidden || !root.offsetParent) return;   // page/tab hidden: skip
    refresh();
  }
  function stop(){ if(timer){ clearInterval(timer); timer = null; } }

  function destroy(){
    if(destroyed) return;
    destroyed = true; stop();
    try{ if(channel) supabase.removeChannel(channel); }catch(e){}
    root.removeEventListener('click', onClick);
    input.removeEventListener('keydown', onKey);
    input.removeEventListener('input', onInput);
    sendBtn.removeEventListener('click', send);
  }

  root.addEventListener('click', onClick);
  input.addEventListener('keydown', onKey);
  input.addEventListener('input', onInput);
  sendBtn.addEventListener('click', send);
  applyComposerState();

  (async () => {
    try{
      const { data: { session } } = await supabase.auth.getSession();
      myId = session && session.user ? session.user.id : null;
    }catch(e){}
    await fetchNames();
    await refresh();
    if(destroyed || broken) return;
    sig = makeSig(); render(); listEl.scrollTop = listEl.scrollHeight;
    // live delivery (the 6-second refresh below covers it if this is not available)
    try{
      channel = supabase.channel('class-chat-' + classId + '-' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'class_messages', filter:'class_id=eq.' + classId }, p => addMsg(p.new))
        .on('postgres_changes', { event:'DELETE', schema:'public', table:'class_messages' }, p => { if(p.old && p.old.id) removeMsg(p.old.id); })
        .subscribe();
    }catch(e){ console.warn('Live chat not available, using refresh only:', e); }
    timer = setInterval(tick, POLL_MS);
  })();

  return { destroy, refresh };
}
