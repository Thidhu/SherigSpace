// ── New question types + teacher preview ─────────────────────────────────
//   ordering  – put items in the right sequence
//   matching  – match each item on the left with its answer (dropdown beside it)
//   dragdrop  – drag items into the correct group box (tap an item, then tap a box, also works)
//   dropfill  – a passage with blanks; each blank is a box with a dropdown to choose the answer
//
// Loaded by teacher.html (builder + preview) and student.html (answering), so both
// pages draw and read the questions exactly the same way.
//
// How an answer is stored (so the existing submit / review flow keeps working):
//   every answer is ONE string — a JSON list, e.g.  ["Seed","Plant","Flower"]
//   the correct answer in assignment_keys is the very same kind of string.
// The questions themselves (what students can read) never contain the correct answers:
//   items are stored in a scrambled order, the right order lives only in assignment_keys.

import { esc } from './config.js';

const T = (en, dz) => (typeof window !== 'undefined' && window.T ? window.T(en, dz) : en);

export const STRUCTURED = ['ordering', 'matching', 'dragdrop', 'dropfill'];
export const isStructured = t => STRUCTURED.includes(t);

export const TYPE_LABELS = {
  ordering: ['Order / Sequence', 'རིམ་པ་བཀོད་པ།'],
  matching: ['Matching', 'མཐུན་སྒྲིག'],
  dragdrop: ['Drag & drop (sort into groups)', 'འདྲུད་ནི་དང་བཞག་ནི།'],
  dropfill: ['Fill blanks (dropdown)', 'ས་སྟོང་བཀང་ (གདམ་ཁ་)']
};
export const typeLabel = t => (TYPE_LABELS[t] ? T(TYPE_LABELS[t][0], TYPE_LABELS[t][1]) : t);
export const DROPFILL_DEFAULT_TEXT = () => T('Choose the correct answer for each blank.');

// ── small helpers ────────────────────────────────────────────────────────
const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
const strArr = a => (Array.isArray(a) ? a.map(x => String(x == null ? '' : x)) : []);
function parseArr(v) {
  if (Array.isArray(v)) return strArr(v);
  if (typeof v !== 'string') return null;
  try { const a = JSON.parse(v); return Array.isArray(a) ? strArr(a) : null; } catch (e) { return null; }
}
function seeded(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) { h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffleDet(arr, seed) {
  const x = arr.slice(), r = seeded(seed);
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}
function scrambled(arr, seed) {           // like shuffleDet, but never leaves the list in its original order
  let out = shuffleDet(arr, seed);
  if (arr.length > 1 && out.every((v, i) => v === arr[i])) out = arr.slice(1).concat(arr[0]);
  return out;
}
const sameMultiset = (a, b) => a.length === b.length && a.slice().sort().join('\u0001') === b.slice().sort().join('\u0001');
const unique = a => { const seen = new Set(); return a.filter(x => { const k = norm(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
const splitList = s => String(s || '').split(/\n|,/).map(x => x.trim()).filter(Boolean);

// ══════════════ TEACHER: builder data ═══════════════════════════════════
export function defaultSq(type) {
  if (type === 'ordering') return { items: ['', '', ''] };
  if (type === 'matching') return { pairs: [{ l: '', r: '' }, { l: '', r: '' }, { l: '', r: '' }], extras: '' };
  if (type === 'dragdrop') return { groups: ['', ''], items: [{ t: '', g: 0 }, { t: '', g: 0 }, { t: '', g: 1 }, { t: '', g: 1 }] };
  if (type === 'dropfill') return { passage: '', wrong: [] };
  return null;
}

/** Builder object -> { item (what students may see), key (the correct answer string) } or { error } */
export function buildForSave(q) {
  const sq = q.sq || defaultSq(q.type);
  const base = { id: q.id, type: q.type, text: String(q.text || '').trim(), points: Math.max(0, Number(q.points ?? 1) || 0) };

  if (q.type === 'ordering') {
    const items = sq.items.map(s => String(s).trim()).filter(Boolean);
    if (items.length < 2) return { error: T('An ordering question needs at least two items.') };
    return { item: { ...base, items: scrambled(items, q.id) }, key: JSON.stringify(items) };
  }

  if (q.type === 'matching') {
    const pairs = sq.pairs.map(p => ({ l: String(p.l).trim(), r: String(p.r).trim() })).filter(p => p.l && p.r);
    if (pairs.length < 2) return { error: T('A matching question needs at least two complete pairs.') };
    const options = shuffleDet(unique([...pairs.map(p => p.r), ...splitList(sq.extras)]), q.id);
    return { item: { ...base, left: pairs.map(p => p.l), options }, key: JSON.stringify(pairs.map(p => p.r)) };
  }

  if (q.type === 'dragdrop') {
    const names = sq.groups.map(g => String(g).trim());
    const used = unique(names.filter(Boolean));
    if (used.length < 2) return { error: T('A drag-and-drop question needs at least two group names.') };
    if (used.length !== names.filter(Boolean).length) return { error: T('Each group needs a different name.') };
    const items = sq.items.filter(it => String(it.t).trim() && names[it.g]).map(it => ({ t: String(it.t).trim(), group: names[it.g] }));
    if (items.length < 2) return { error: T('Add at least two items and choose a group for each.') };
    const order = shuffleDet(items.map((_, i) => i), q.id);
    return { item: { ...base, items: order.map(i => items[i].t), options: used }, key: JSON.stringify(order.map(i => items[i].group)) };
  }

  if (q.type === 'dropfill') {
    const passage = String(sq.passage || '').trim();
    const correct = [];
    const template = passage.replace(/\[\[([^\]]+?)\]\]/g, (m, a) => { correct.push(a.trim()); return '{{' + (correct.length - 1) + '}}'; });
    if (!correct.length) return { error: T('Write the passage and put each correct answer inside double brackets, like [[answer]].') };
    if (correct.some(c => !c)) return { error: T('A blank in the passage is empty.') };
    const blanks = correct.map((c, i) => ({ options: shuffleDet(unique([c, ...splitList((sq.wrong || [])[i])]), q.id + '|' + i) }));
    return { item: { ...base, text: base.text || DROPFILL_DEFAULT_TEXT(), template, blanks }, key: JSON.stringify(correct) };
  }
  return { error: 'Unknown question type.' };
}

/** A saved question (+ its key) -> builder object, so a task can be edited again */
export function fromSaved(q, keyVal) {
  const k = parseArr(keyVal);
  const out = { id: q.id, type: q.type, text: q.text, points: q.points, options: [], correct: null, accepted: '', media_url: '' };
  if (q.type === 'ordering') {
    const items = (k && sameMultiset(k, q.items)) ? k : q.items.slice();
    out.sq = { items };
  } else if (q.type === 'matching') {
    const left = q.left || [];
    const pairs = left.map((l, i) => ({ l, r: k && k[i] != null ? k[i] : '' }));
    const extras = (q.options || []).filter(o => !(k || []).some(r => norm(r) === norm(o))).join(', ');
    out.sq = { pairs, extras };
  } else if (q.type === 'dragdrop') {
    const groups = (q.options || []).slice();
    out.sq = { groups, items: (q.items || []).map((t, i) => ({ t, g: k && k[i] != null ? Math.max(0, groups.indexOf(k[i])) : 0 })) };
  } else if (q.type === 'dropfill') {
    const blanks = q.blanks || [];
    const passage = String(q.template || '').replace(/\{\{(\d+)\}\}/g, (m, i) => '[[' + ((k && k[Number(i)]) || '?') + ']]');
    const wrong = blanks.map((b, i) => (b.options || []).filter(o => !k || norm(o) !== norm(k[i])).join(', '));
    out.sq = { passage, wrong };
  }
  return out;
}

// ══════════════ TEACHER: builder UI ═════════════════════════════════════
const ic = (act, j, label, extra = '') => `<button type="button" class="sqb-btn" data-sq-act="${act}" data-j="${j}" ${extra}>${label}</button>`;
const hint = s => `<div class="sqb-hint">${s}</div>`;

function blanksHtml(sq) {
  const found = [...String(sq.passage || '').matchAll(/\[\[([^\]]+?)\]\]/g)].map(m => m[1].trim());
  if (!found.length) return `<div class="sqb-hint">${T('No blanks yet. Put each correct answer inside double brackets: [[answer]].')}</div>`;
  return found.map((c, j) => `<div class="sqb-row"><span class="sqb-n">${j + 1}</span><b class="sqb-ans">${esc(c)}</b>
    <input data-sq-f="wrong" data-j="${j}" value="${esc((sq.wrong || [])[j] || '')}" placeholder="${T('Wrong choices for this blank (comma separated)…')}"/></div>`).join('');
}

export function builderHtml(q) {
  const sq = q.sq || (q.sq = defaultSq(q.type));
  if (q.type === 'ordering') {
    return `<div class="sqb" data-sqb="ordering">
      ${hint(T('Type the items in the <b>correct order</b>. Students see them mixed up and put them in order.'))}
      ${sq.items.map((t, j) => `<div class="sqb-row"><span class="sqb-n">${j + 1}</span>
        <input data-sq-f="item" data-j="${j}" value="${esc(t)}" placeholder="${T('Item')} ${j + 1}"/>
        ${ic('item-up', j, '↑', j === 0 ? 'disabled' : '')}${ic('item-down', j, '↓', j === sq.items.length - 1 ? 'disabled' : '')}${ic('item-del', j, '✕')}</div>`).join('')}
      <button type="button" class="sqb-btn" data-sq-act="item-add">${T('＋ Add item')}</button></div>`;
  }
  if (q.type === 'matching') {
    return `<div class="sqb" data-sqb="matching">
      ${hint(T('Type each pair. Students see the left side and choose the matching answer from a dropdown beside it.'))}
      ${sq.pairs.map((p, j) => `<div class="sqb-row"><span class="sqb-n">${j + 1}</span>
        <input data-sq-f="pl" data-j="${j}" value="${esc(p.l)}" placeholder="${T('Left side')}"/><span class="sqb-arrow">→</span>
        <input data-sq-f="pr" data-j="${j}" value="${esc(p.r)}" placeholder="${T('Matching answer')}"/>${ic('pair-del', j, '✕')}</div>`).join('')}
      <button type="button" class="sqb-btn" data-sq-act="pair-add">${T('＋ Add pair')}</button>
      <input data-sq-f="extras" value="${esc(sq.extras || '')}" placeholder="${T('Extra wrong answers (optional, comma separated)…')}" style="margin-top:.4rem"/></div>`;
  }
  if (q.type === 'dragdrop') {
    return `<div class="sqb" data-sqb="dragdrop">
      ${hint(T('Name the groups, then type the items and choose which group each one belongs to. Students drag each item into its group.'))}
      <div class="sqb-sub">${T('Groups')}</div>
      ${sq.groups.map((g, j) => `<div class="sqb-row"><span class="sqb-n">${j + 1}</span>
        <input data-sq-f="group" data-j="${j}" value="${esc(g)}" placeholder="${T('Group name')}"/>${ic('group-del', j, '✕')}</div>`).join('')}
      <button type="button" class="sqb-btn" data-sq-act="group-add">${T('＋ Add group')}</button>
      <div class="sqb-sub">${T('Items')}</div>
      ${sq.items.map((it, j) => `<div class="sqb-row"><span class="sqb-n">${j + 1}</span>
        <input data-sq-f="dt" data-j="${j}" value="${esc(it.t)}" placeholder="${T('Item')}"/><span class="sqb-arrow">→</span>
        <select data-sq-f="dg" data-j="${j}">${sq.groups.map((g, gi) => `<option value="${gi}" ${it.g === gi ? 'selected' : ''}>${esc(g.trim() || (T('Group') + ' ' + (gi + 1)))}</option>`).join('')}</select>${ic('dtem-del', j, '✕')}</div>`).join('')}
      <button type="button" class="sqb-btn" data-sq-act="dtem-add">${T('＋ Add item')}</button></div>`;
  }
  if (q.type === 'dropfill') {
    return `<div class="sqb" data-sqb="dropfill">
      ${hint(T('Write the passage and put each correct answer in <b>[[double brackets]]</b>. Each blank becomes a box with a dropdown. The text above is just an instruction (optional).'))}
      <textarea data-sq-f="passage" rows="4" placeholder="${T('Example: The [[sun]] rises in the [[east]].')}">${esc(sq.passage || '')}</textarea>
      <div class="sqb-sub">${T('Blanks')}</div>
      <div data-sq-blanks>${blanksHtml(sq)}</div></div>`;
  }
  return '';
}

/** One set of listeners on the builder container (survives every re-render). */
export function wireStructuredBuilder(container, getQuestions, rerender) {
  if (!container || container.__sqbWired) return;
  container.__sqbWired = true;
  const qOf = el => { const box = el.closest('.qb'); return box ? getQuestions()[Number(box.dataset.qi)] : null; };

  container.addEventListener('input', e => {
    const f = e.target.getAttribute && e.target.getAttribute('data-sq-f');
    if (!f) return;
    const q = qOf(e.target); if (!q || !q.sq) return;
    const sq = q.sq, j = Number(e.target.getAttribute('data-j')), v = e.target.value;
    if (f === 'item') sq.items[j] = v;
    else if (f === 'pl') sq.pairs[j].l = v;
    else if (f === 'pr') sq.pairs[j].r = v;
    else if (f === 'extras') sq.extras = v;
    else if (f === 'group') sq.groups[j] = v;
    else if (f === 'dt') sq.items[j].t = v;
    else if (f === 'dg') sq.items[j].g = Number(v);
    else if (f === 'wrong') { sq.wrong = sq.wrong || []; sq.wrong[j] = v; }
    else if (f === 'passage') {
      sq.passage = v;
      const box = e.target.closest('.sqb').querySelector('[data-sq-blanks]');
      if (box) box.innerHTML = blanksHtml(sq);
    }
  });
  container.addEventListener('change', e => {            // group names feed the item dropdowns -> redraw when finished typing
    if (e.target.getAttribute && e.target.getAttribute('data-sq-f') === 'group') rerender();
  });
  container.addEventListener('click', e => {
    const b = e.target.closest('[data-sq-act]'); if (!b) return;
    const q = qOf(b); if (!q || !q.sq) return;
    const sq = q.sq, act = b.getAttribute('data-sq-act'), j = Number(b.getAttribute('data-j'));
    const swap = (arr, a, c) => { if (c < 0 || c >= arr.length) return; [arr[a], arr[c]] = [arr[c], arr[a]]; };
    const min2 = arr => { if (arr.length <= 2) { alert(T('At least two are needed.')); return false; } return true; };
    if (act === 'item-add') sq.items.push('');
    else if (act === 'item-del') { if (!min2(sq.items)) return; sq.items.splice(j, 1); }
    else if (act === 'item-up') swap(sq.items, j, j - 1);
    else if (act === 'item-down') swap(sq.items, j, j + 1);
    else if (act === 'pair-add') sq.pairs.push({ l: '', r: '' });
    else if (act === 'pair-del') { if (!min2(sq.pairs)) return; sq.pairs.splice(j, 1); }
    else if (act === 'group-add') sq.groups.push('');
    else if (act === 'group-del') {
      if (!min2(sq.groups)) return;
      sq.groups.splice(j, 1);
      sq.items.forEach(it => { if (it.g === j) it.g = 0; else if (it.g > j) it.g--; });
    }
    else if (act === 'dtem-add') sq.items.push({ t: '', g: 0 });
    else if (act === 'dtem-del') { if (!min2(sq.items)) return; sq.items.splice(j, 1); }
    else return;
    rerender();
  });
}

// ══════════════ ANSWER TEXT + CHECKING ══════════════════════════════════
/** A readable one-line version of a stored answer (or key) */
export function answerText(q, v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || !q || !isStructured(q.type)) return s;
  const a = parseArr(s);
  if (!a) return s;
  if (q.type === 'ordering') return a.map((t, i) => (i + 1) + ') ' + t).join('  →  ');
  if (q.type === 'matching') return (q.left || []).map((l, i) => l + ' → ' + (a[i] || '—')).join(';  ');
  if (q.type === 'dragdrop') {
    const groups = q.options || [];
    return groups.map(g => g + ': ' + ((q.items || []).filter((t, i) => a[i] === g).join(', ') || '—')).join(';  ')
      + ((q.items || []).some((t, i) => !a[i]) ? ';  ' + T('Not placed') + ': ' + (q.items || []).filter((t, i) => !a[i]).join(', ') : '');
  }
  if (q.type === 'dropfill') return a.map((t, i) => '(' + (i + 1) + ') ' + (t || '—')).join('   ');
  return s;
}

/** Compares a student's answer with the key, slot by slot. */
export function checkAnswer(q, v, key) {
  const exp = parseArr(key);
  if (!exp) return { status: 'nokey', ok: 0, total: 0 };
  const ans = parseArr(v);
  if (!ans) return { status: 'none', ok: 0, total: exp.length };
  let ok = 0;
  exp.forEach((e, i) => { if (norm(ans[i]) === norm(e)) ok++; });
  return { status: ok === exp.length ? 'correct' : ok > 0 ? 'partial' : 'wrong', ok, total: exp.length };
}

// ══════════════ DRAWING A QUESTION (student + preview) ══════════════════
const REG = new Map();                         // scope|questionId -> question
const rk = (scope, id) => scope + '|' + id;

function currentOrder(q, value) {
  const a = parseArr(value);
  return (a && sameMultiset(a, q.items || [])) ? a : (q.items || []).slice();
}

function innerHtml(q, value, ro) {
  const dis = ro ? 'disabled' : '';
  if (q.type === 'ordering') {
    const order = currentOrder(q, value);
    return `<ol class="sq-olist">${order.map((t, i) => `<li class="sq-oitem" data-sq-i="${i}">
      ${ro ? '' : `<span class="sq-handle" data-sq-handle title="${T('Drag to move')}">⠿</span>`}<span class="sq-onum">${i + 1}</span><span class="sq-otext">${esc(t)}</span>
      ${ro ? '' : `<span class="sq-arrows"><button type="button" data-sq-move="-1" aria-label="${T('Move up')}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-sq-move="1" aria-label="${T('Move down')}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></span>`}</li>`).join('')}</ol>
      ${ro ? '' : `<div class="sq-help">${T('Drag ⠿ or use ↑ ↓ to put the items in the right order.')}</div>`}`;
  }
  if (q.type === 'matching') {
    const a = parseArr(value) || [];
    return `<div class="sq-mlist">${(q.left || []).map((l, i) => `<div class="sq-mrow"><span class="sq-mleft">${esc(l)}</span><span class="sq-arrow">→</span>
      <span class="sq-blank"><select data-sq-sel="${i}" ${dis}><option value="">${T('— choose —', '— གདམ་ཁ —')}</option>${(q.options || []).map(o => `<option value="${esc(o)}" ${a[i] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></span></div>`).join('')}</div>`;
  }
  if (q.type === 'dragdrop') {
    const a = parseArr(value) || [], groups = q.options || [], items = q.items || [];
    const where = i => groups.indexOf(a[i]);
    const chip = i => `<button type="button" class="sq-chip" data-sq-chip="${i}" ${dis}>${esc(items[i])}</button>`;
    const bank = items.map((t, i) => i).filter(i => where(i) < 0).map(chip).join('');
    return `<div class="sq-bank" data-sq-zone="-1">${bank || `<span class="sq-empty">${T('All items placed ✓')}</span>`}</div>
      <div class="sq-groups">${groups.map((g, gi) => `<div class="sq-group" data-sq-zone="${gi}"><div class="sq-gtitle">${esc(g)}</div>
        <div class="sq-gdrop">${items.map((t, i) => i).filter(i => where(i) === gi).map(chip).join('')}</div></div>`).join('')}</div>
      ${ro ? '' : `<div class="sq-help">${T('Drag each item into its group (or tap an item, then tap a group).')}</div>`}`;
  }
  if (q.type === 'dropfill') {
    const a = parseArr(value) || [];
    const sel = i => `<span class="sq-blank"><select data-sq-sel="${i}" ${dis}><option value="">${T('— choose —', '— གདམ་ཁ —')}</option>${(((q.blanks || [])[i] || {}).options || []).map(o => `<option value="${esc(o)}" ${a[i] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></span>`;
    return `<div class="sq-dtext">${String(q.template || '').split(/\{\{(\d+)\}\}/).map((p, k) => k % 2 === 0 ? esc(p).replace(/\n/g, '<br>') : sel(Number(p))).join('')}</div>`;
  }
  return '';
}

export function widgetHtml(q, value, opts = {}) {
  const scope = String(opts.scope == null ? 'x' : opts.scope);
  REG.set(rk(scope, q.id), q);
  return `<div class="sq-widget sq-${q.type}" data-sq-scope="${esc(scope)}" data-sq-q="${esc(q.id)}" ${opts.readonly ? 'data-sq-ro' : ''}>${innerHtml(q, value, !!opts.readonly)}</div>`;
}

// ══════════════ WIRING (student page + preview) ═════════════════════════
let SEL = null;                 // tapped item waiting for a group (touch-friendly alternative to dragging)
let suppressUntil = 0;

/**
 * handlers = { getValue(scope, qid) -> string, setValue(scope, qid, string) }
 * Safe to call after every render: listeners are only added once per root.
 */
export function wireWidgets(root, handlers) {
  if (!root) return;
  root.__sqH = handlers;
  if (root.__sqWired) return;
  root.__sqWired = true;

  const ctxOf = el => {
    const w = el.closest && el.closest('.sq-widget'); if (!w) return null;
    const scope = w.getAttribute('data-sq-scope'), qid = w.getAttribute('data-sq-q');
    const q = REG.get(rk(scope, qid)); if (!q) return null;
    return { w, scope, qid, q, ro: w.hasAttribute('data-sq-ro'), h: root.__sqH };
  };
  const read = c => c.h.getValue(c.scope, c.qid) || '';
  const write = (c, arr) => {
    const empty = c.q.type !== 'ordering' && arr.every(x => !String(x || '').trim());
    const val = empty ? '' : JSON.stringify(arr);
    c.h.setValue(c.scope, c.qid, val);
    c.w.innerHTML = innerHtml(c.q, val, false);
  };
  const place = (c, idx, zone) => {
    const n = (c.q.items || []).length, cur = parseArr(read(c)) || [];
    const arr = Array.from({ length: n }, (_, i) => cur[i] || '');
    arr[idx] = zone < 0 ? '' : (c.q.options || [])[zone] || '';
    write(c, arr);
  };
  const moveItem = (c, from, to) => {
    const order = currentOrder(c.q, read(c));
    if (to < 0 || to >= order.length || from === to) return;
    const [m] = order.splice(from, 1); order.splice(to, 0, m);
    write(c, order);
  };

  root.addEventListener('change', e => {
    const s = e.target.closest && e.target.closest('select[data-sq-sel]'); if (!s) return;
    const c = ctxOf(s); if (!c || c.ro) return;
    const n = c.q.type === 'matching' ? (c.q.left || []).length : (c.q.blanks || []).length;
    const cur = parseArr(read(c)) || [];
    const arr = Array.from({ length: n }, (_, i) => cur[i] || '');
    arr[Number(s.getAttribute('data-sq-sel'))] = s.value;
    write(c, arr);
  });

  root.addEventListener('click', e => {
    if (Date.now() < suppressUntil) return;
    const mv = e.target.closest && e.target.closest('[data-sq-move]');
    if (mv) {
      const c = ctxOf(mv); if (!c || c.ro) return;
      const li = mv.closest('.sq-oitem'), i = Number(li.getAttribute('data-sq-i'));
      moveItem(c, i, i + Number(mv.getAttribute('data-sq-move')));
      return;
    }
    const chip = e.target.closest && e.target.closest('[data-sq-chip]');
    if (chip) {
      const c = ctxOf(chip); if (!c || c.ro) return;
      const idx = Number(chip.getAttribute('data-sq-chip'));
      c.w.querySelectorAll('.sq-sel').forEach(n => n.classList.remove('sq-sel'));
      if (SEL && SEL.scope === c.scope && SEL.qid === c.qid && SEL.idx === idx) SEL = null;
      else { SEL = { scope: c.scope, qid: c.qid, idx }; chip.classList.add('sq-sel'); }
      return;
    }
    const zone = e.target.closest && e.target.closest('[data-sq-zone]');
    if (zone && SEL) {
      const c = ctxOf(zone);
      if (c && !c.ro && SEL.scope === c.scope && SEL.qid === c.qid) { const idx = SEL.idx; SEL = null; place(c, idx, Number(zone.getAttribute('data-sq-zone'))); }
    }
  });

  // Dragging with the mouse, a finger or a pen (Pointer Events)
  root.addEventListener('pointerdown', e => {
    const h = e.target.closest && e.target.closest('[data-sq-handle], .sq-chip'); if (!h) return;
    const c = ctxOf(h); if (!c || c.ro) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const isOrder = h.hasAttribute('data-sq-handle');
    const src = isOrder ? h.closest('.sq-oitem') : h;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null, dragging = false;
    const targetAt = (x, y) => { const el = document.elementFromPoint(x, y); return el ? el.closest(isOrder ? '.sq-oitem' : '[data-sq-zone]') : null; };
    const clearOver = () => c.w.querySelectorAll('.sq-over').forEach(n => n.classList.remove('sq-over'));
    const cleanup = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      if (ghost) ghost.remove(); src.classList.remove('sq-dragging'); clearOver();
    };
    const move = ev => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        dragging = true;
        ghost = src.cloneNode(true); ghost.classList.add('sq-ghost'); ghost.style.width = src.offsetWidth + 'px';
        document.body.appendChild(ghost); src.classList.add('sq-dragging');
      }
      ghost.style.left = (ev.clientX + 10) + 'px'; ghost.style.top = (ev.clientY + 10) + 'px';
      clearOver();
      const t = targetAt(ev.clientX, ev.clientY);
      if (t && c.w.contains(t)) t.classList.add('sq-over');
      ev.preventDefault();
    };
    const up = ev => {
      const was = dragging, t = was ? targetAt(ev.clientX, ev.clientY) : null;
      cleanup();
      if (!was) return;
      suppressUntil = Date.now() + 350;
      if (!t || !c.w.contains(t)) return;
      if (isOrder) moveItem(c, Number(src.getAttribute('data-sq-i')), Number(t.getAttribute('data-sq-i')));
      else place(c, Number(src.getAttribute('data-sq-chip')), Number(t.getAttribute('data-sq-zone')));
    };
    const cancel = () => cleanup();
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });
}

// ══════════════ TEACHER: preview ═══════════════════════════════════════
/** Builder questions -> [{ q (as students see it), key }] plus any problems found */
export function itemsFromBuilder(list) {
  const items = [], errors = [];
  (list || []).forEach((q, n) => {
    let text = String(q.text || '').trim();
    if (q.type === 'dropfill' && !text) text = DROPFILL_DEFAULT_TEXT();
    if (!text) return;
    if (isStructured(q.type)) {
      const r = buildForSave({ ...q, text });
      if (r.error) errors.push(T('Question') + ' ' + (n + 1) + ': ' + r.error); else items.push({ q: r.item, key: r.key });
      return;
    }
    const item = { id: q.id, type: q.type, text, points: Math.max(0, Number(q.points ?? 1) || 0), media_url: q.media_url || '', options: [] };
    let key = null;
    if (q.type === 'choice') {
      item.options = (q.options || []).map(o => String(o).trim()).filter(Boolean);
      const c = (q.options || [])[q.correct]; if (c && String(c).trim()) key = String(c).trim();
    } else if (q.type === 'truefalse') {
      item.options = ['True', 'False'];
      if (q.correct === 0 || q.correct === 1) key = item.options[q.correct];
    } else if (['fillblank', 'short', 'image', 'audio'].includes(q.type)) {
      const acc = splitList(q.accepted); if (acc.length) key = acc;
    }
    items.push({ q: item, key });
  });
  return { items, errors };
}

function evaluate(q, val, key) {
  const v = String(val == null ? '' : val).trim();
  if (isStructured(q.type)) {
    const r = checkAnswer(q, v, key);
    return { ...r, shown: key != null ? answerText(q, typeof key === 'string' ? key : JSON.stringify(key)) : '' };
  }
  if (q.type === 'long') return { status: 'manual' };
  if (key == null || (Array.isArray(key) && !key.length)) return { status: 'nokey' };
  const exp = Array.isArray(key) ? key : [key];
  const shown = exp.join(' / ');
  if (!v) return { status: 'none', shown };
  return { status: exp.some(x => norm(x) === norm(v)) ? 'correct' : 'wrong', shown };
}

function simpleInput(q, val, scope) {
  const id = esc(q.id), v = esc(val || '');
  if (q.type === 'long') return `<textarea data-pv-in="${id}" placeholder="${T('Write your answer…')}">${v}</textarea>`;
  if (q.type === 'choice' || q.type === 'truefalse') {
    return `<div class="sq-opts">${(q.options || []).map(o => `<label class="sq-opt"><input type="radio" name="pv-${esc(scope)}-${id}" data-pv-in="${id}" data-val="${esc(o)}" ${val === o ? 'checked' : ''}/><span>${esc(o)}</span></label>`).join('')}</div>`;
  }
  const media = q.type === 'image' && q.media_url ? `<img src="${esc(q.media_url)}" alt="" style="max-width:100%;border-radius:8px;margin:.4rem 0"/>`
    : q.type === 'audio' && q.media_url ? `<audio controls preload="none" src="${esc(q.media_url)}" style="width:100%;margin:.4rem 0"></audio>` : '';
  return `${media}<input type="text" data-pv-in="${id}" value="${v}" placeholder="${T('Your answer…')}"/>`;
}

/**
 * Opens a full-screen preview of how the questions look and work for a student.
 * items = [{ q, key }] — nothing is saved; the teacher can try the questions and press "Check answers".
 */
export function openQuestionPreview(items, opts = {}) {
  const old = document.getElementById('sq-pv'); if (old) old.remove();
  const list = (items || []).filter(it => it && it.q);
  const values = {};
  const scope = 'pv' + Date.now().toString(36);
  const ov = document.createElement('div');
  ov.id = 'sq-pv'; ov.className = 'sq-pv';
  ov.innerHTML = `<div class="sq-pv-box" role="dialog" aria-modal="true">
    <div class="sq-pv-head"><div><b>👁 ${T('Preview', 'སྔོན་བལྟ།')}</b><div class="sq-pv-sub">${esc(opts.title || T('This is how students will see the questions. Nothing here is saved.'))}</div></div>
      <button type="button" class="sq-pv-x" data-pv-close aria-label="${T('Close')}">✕</button></div>
    <div class="sq-pv-body" data-pv-body></div>
    <div class="sq-pv-foot"><span data-pv-score class="sq-pv-score"></span>
      <button type="button" class="sqb-btn" data-pv-reset>↺ ${T('Reset')}</button>
      <button type="button" class="sq-pv-check" data-pv-check>✓ ${T('Check answers', 'ལན་ཚུ་ཞིབ་དཔྱད།')}</button></div></div>`;
  document.body.appendChild(ov);
  const body = ov.querySelector('[data-pv-body]'), scoreEl = ov.querySelector('[data-pv-score]');

  const draw = () => {
    scoreEl.textContent = '';
    body.innerHTML = list.length ? list.map((it, i) => `<div class="sq-pq" data-pq="${i}">
      <div class="sq-pq-text"><span class="sq-pq-n">${i + 1}.</span>${esc(it.q.text)} <span class="sq-pq-pts">${esc(it.q.points == null ? 1 : it.q.points)} ${T('pt')}</span></div>
      ${isStructured(it.q.type) ? widgetHtml(it.q, values[it.q.id], { scope }) : simpleInput(it.q, values[it.q.id], scope)}
      <div class="sq-pq-res" data-res="${i}"></div></div>`).join('')
      : `<div class="sq-empty" style="padding:1rem">${T('There are no questions to preview yet.')}</div>`;
  };
  const close = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-pv-close]')) return close();
    if (e.target.closest('[data-pv-reset]')) { Object.keys(values).forEach(k => delete values[k]); draw(); return; }
    if (e.target.closest('[data-pv-check]')) {
      let ok = 0, total = 0;
      list.forEach((it, i) => {
        const r = evaluate(it.q, values[it.q.id], it.key), el = body.querySelector(`[data-res="${i}"]`);
        let html = '', cls = '';
        if (r.status === 'correct') { html = '✓ ' + T('Correct', 'ལེགས་ཤོམ'); cls = 'ok'; }
        else if (r.status === 'partial') { html = `◐ ${T('Partly correct')} (${r.ok}/${r.total}) — ${T('Correct answer')}: ${esc(r.shown)}`; cls = 'mid'; }
        else if (r.status === 'wrong') { html = `✗ ${T('Not quite')} — ${T('Correct answer')}: ${esc(r.shown)}`; cls = 'bad'; }
        else if (r.status === 'none') { html = `— ${T('Not answered')}${r.shown ? ' — ' + T('Correct answer') + ': ' + esc(r.shown) : ''}`; cls = 'bad'; }
        else if (r.status === 'manual') { html = 'ℹ️ ' + T('Paragraph answers are marked by you.'); cls = 'info'; }
        else { html = 'ℹ️ ' + T('No correct answer is set for this question yet.'); cls = 'info'; }
        if (['correct', 'partial', 'wrong', 'none'].includes(r.status)) { total++; if (r.status === 'correct') ok++; }
        el.className = 'sq-pq-res show ' + cls; el.innerHTML = html;
      });
      scoreEl.textContent = total ? `${ok} / ${total} ${T('auto-checked questions correct')}` : '';
    }
  });
  const onVal = e => {
    const t = e.target.closest && e.target.closest('[data-pv-in]'); if (!t) return;
    values[t.getAttribute('data-pv-in')] = t.type === 'radio' ? (t.checked ? t.getAttribute('data-val') : values[t.getAttribute('data-pv-in')]) : t.value;
  };
  ov.addEventListener('input', onVal); ov.addEventListener('change', onVal);
  wireWidgets(ov, { getValue: (s, id) => values[id] || '', setValue: (s, id, v) => { values[id] = v; } });
  draw();
}

// ══════════════ styles (self-contained, works in day + night mode) ══════
(function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById('sq-style')) return;
  const st = document.createElement('style'); st.id = 'sq-style';
  st.textContent = `
.sq-widget{margin:.5rem 0;color:var(--text,inherit)}
.sq-help,.sqb-hint{font-size:.78rem;color:var(--text2,#889);margin:.35rem 0;line-height:1.5}
.sq-olist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem}
.sq-oitem{display:flex;align-items:center;gap:.55rem;padding:.55rem .7rem;border:1px solid var(--border,#3a4a66);border-radius:10px;background:var(--surface2,rgba(127,127,127,.08));user-select:none}
.sq-handle{cursor:grab;touch-action:none;font-size:1.15rem;line-height:1;padding:.1rem .3rem;opacity:.75}
.sq-onum{min-width:1.5rem;height:1.5rem;border-radius:50%;background:var(--gold,#00bfff);color:var(--on-accent,#fff);display:inline-flex;align-items:center;justify-content:center;font-size:.76rem;font-weight:700}
.sq-otext{flex:1}
.sq-arrows{display:flex;gap:.25rem}
.sq-arrows button,.sqb-btn{border:1px solid var(--border,#3a4a66);background:transparent;color:inherit;border-radius:8px;padding:.25rem .55rem;cursor:pointer;font:inherit;font-size:.8rem}
.sq-arrows button:disabled,.sqb-btn:disabled{opacity:.35;cursor:default}
.sq-oitem.sq-dragging,.sq-chip.sq-dragging{opacity:.35}
.sq-over{outline:2px dashed var(--gold,#00bfff);outline-offset:2px}
.sq-ghost{position:fixed;z-index:100001;pointer-events:none;opacity:.92;box-shadow:0 8px 24px rgba(0,0,0,.35);background:var(--surface,#fff);color:var(--text,#111);border-radius:10px}
.sq-mlist{display:flex;flex-direction:column;gap:.5rem}
.sq-mrow{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.sq-mleft{flex:1 1 40%;min-width:130px;padding:.5rem .7rem;border:1px solid var(--border,#3a4a66);border-radius:10px;background:var(--surface2,rgba(127,127,127,.08))}
.sq-arrow,.sqb-arrow{opacity:.7}
.sq-blank{display:inline-flex;align-items:stretch;border:1.5px solid var(--gold,#00bfff);border-radius:8px;background:var(--input-bg,var(--surface,#fff));min-width:130px;max-width:100%;margin:0 .15rem;vertical-align:middle;overflow:hidden}
.sq-blank select{appearance:none;-webkit-appearance:none;border:0;background:transparent;color:var(--text,inherit);font:inherit;padding:.35rem 1.9rem .35rem .6rem;min-width:130px;width:100%;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 15px) 55%,calc(100% - 10px) 55%;background-size:5px 5px,5px 5px;background-repeat:no-repeat}
.sq-blank select option{color:#111;background:#fff}
.sq-dtext{line-height:2.4}
.sq-bank,.sq-gdrop{display:flex;flex-wrap:wrap;gap:.45rem;min-height:2.6rem;padding:.5rem;border:1.5px dashed var(--border,#3a4a66);border-radius:10px}
.sq-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.6rem;margin-top:.6rem}
.sq-group{border:1.5px solid var(--border,#3a4a66);border-radius:12px;padding:.45rem;background:var(--surface2,rgba(127,127,127,.06))}
.sq-gtitle{font-weight:700;font-size:.85rem;margin:.1rem .2rem .35rem}
.sq-gdrop{border-style:solid;border-color:transparent;min-height:3rem}
.sq-chip{touch-action:none;cursor:grab;border:1px solid var(--gold,#00bfff);background:var(--surface,#fff);color:var(--text,#111);border-radius:999px;padding:.35rem .8rem;font:inherit;font-size:.88rem}
.sq-chip.sq-sel{background:var(--gold,#00bfff);color:var(--on-accent,#fff)}
.sq-empty{font-size:.8rem;color:var(--text2,#889)}
.sq-opts{display:flex;flex-direction:column;gap:.35rem}.sq-opt{display:flex;gap:.5rem;align-items:center;cursor:pointer}
.sqb{margin-top:.6rem;padding:.7rem;border:1px dashed var(--border,#3a4a66);border-radius:10px;display:flex;flex-direction:column;gap:.4rem}
.sqb-row{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap}
.sqb-row input,.sqb-row select{flex:1 1 140px;min-width:0}
.sqb-n{min-width:1.3rem;text-align:center;font-weight:700;opacity:.7}
.sqb-sub{font-weight:700;font-size:.8rem;margin-top:.3rem}
.sqb-ans{padding:.2rem .5rem;border-radius:6px;background:rgba(0,170,90,.15)}
.sqb textarea{width:100%;box-sizing:border-box}
.sq-pv{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem}
.sq-pv-box{background:var(--surface,#fff);color:var(--text,#111);border-radius:16px;width:min(760px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.45);overflow:hidden}
.sq-pv-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;padding:1rem 1.2rem;border-bottom:1px solid var(--border,#ddd)}
.sq-pv-sub{font-size:.78rem;color:var(--text2,#667);margin-top:.15rem}
.sq-pv-x{border:0;background:transparent;color:inherit;font-size:1.2rem;cursor:pointer}
.sq-pv-body{padding:1rem 1.2rem;overflow:auto;display:flex;flex-direction:column;gap:1rem}
.sq-pv-foot{display:flex;gap:.6rem;align-items:center;justify-content:flex-end;flex-wrap:wrap;padding:.8rem 1.2rem;border-top:1px solid var(--border,#ddd)}
.sq-pv-score{margin-right:auto;font-weight:600;font-size:.85rem}
.sq-pv-check{border:0;border-radius:10px;padding:.55rem 1.1rem;background:var(--gold,#00bfff);color:var(--on-accent,#fff);font:inherit;font-weight:700;cursor:pointer}
.sq-pq{padding:.8rem;border:1px solid var(--border,#ddd);border-radius:12px}
.sq-pq-text{font-weight:600;margin-bottom:.4rem}.sq-pq-n{margin-right:.35rem;opacity:.7}.sq-pq-pts{font-weight:400;font-size:.74rem;opacity:.6;margin-left:.3rem}
.sq-pq input[type=text],.sq-pq textarea{width:100%;box-sizing:border-box}
.sq-pq-res{display:none;margin-top:.5rem;padding:.45rem .7rem;border-radius:8px;font-size:.84rem}
.sq-pq-res.show{display:block}.sq-pq-res.ok{background:rgba(0,170,90,.16)}.sq-pq-res.bad{background:rgba(220,60,60,.16)}.sq-pq-res.mid{background:rgba(230,160,0,.18)}.sq-pq-res.info{background:rgba(127,127,127,.15)}
`;
  document.head.appendChild(st);
})();
