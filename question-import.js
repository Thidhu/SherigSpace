// ── Import quiz questions from a Word (.docx) or Excel (.xlsx / .xls / .csv) file ──
// Used by teacher.html's task form. Nothing is uploaded: the file is read in the
// teacher's browser and the questions are added to the form, where they can still
// be edited before saving.
//
// Returns questions in the same shape the form already uses:
//   { type, text, options[], correct (option index | null), accepted (string), points }

const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_QUESTIONS = 300;
const LETTERS = 'ABCDEFGH';

const loading = {};
function loadScript(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (loading[url]) return loading[url];
  loading[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error('Library loaded but not found.'));
    s.onerror = () => { delete loading[url]; reject(new Error('Could not load the file-reading library. Check your internet connection and try again.')); };
    document.head.appendChild(s);
  });
  return loading[url];
}

// ── turning one parsed question into the form's shape (shared by Word + Excel) ──
function normType(raw) {
  const t = String(raw || '').toLowerCase().trim();
  if (!t) return '';
  if (/true|false|^t\/?f$/.test(t)) return 'truefalse';
  if (/multi|mcq|choice|^mc$|select/.test(t)) return 'choice';
  if (/para|long|essay|descr/.test(t)) return 'long';
  if (/fill|blank/.test(t)) return 'fillblank';
  if (/short|text|answer/.test(t)) return 'short';
  return '';
}

function build(part, warn) {
  const text = String(part.text || '').trim();
  if (!text) return null;
  const label = '"' + text.slice(0, 40) + (text.length > 40 ? '…' : '') + '"';
  const options = (part.options || []).map(o => String(o).trim()).filter(Boolean).slice(0, LETTERS.length);
  const correctRaw = String(part.correctRaw == null ? '' : part.correctRaw).trim();
  let type = normType(part.typeRaw);
  if (!type) {
    if (options.length >= 2) type = 'choice';
    else if (/^(true|false|t|f)$/i.test(correctRaw)) type = 'truefalse';
    else type = 'short';
  }
  if (type === 'choice' && options.length < 2) {
    warn(label + ' is marked multiple choice but has fewer than 2 options — imported as a short answer.');
    type = 'short';
  }
  const q = { type, text, options: [], correct: null, accepted: '', points: 1 };
  const pts = parseFloat(part.points);
  if (isFinite(pts) && pts >= 0) q.points = pts;

  if (type === 'choice') {
    q.options = options;
    if (correctRaw) {
      const first = correctRaw.split(/[,;&/|]| and /i)[0].trim().replace(/^\(|\)$/g, '');
      if (first.length !== correctRaw.replace(/^\(|\)$/g, '').length && /^[A-Ha-h]$/.test(first)) {
        warn(label + ': only one correct option is supported — kept ' + first.toUpperCase() + '.');
      }
      let idx = -1;
      const textMatch = options.findIndex(o => o.toLowerCase() === correctRaw.toLowerCase());
      if (textMatch >= 0) idx = textMatch;
      else if (/^[A-Ha-h]$/.test(first) && LETTERS.indexOf(first.toUpperCase()) < options.length) idx = LETTERS.indexOf(first.toUpperCase());
      else if (/^[1-8]$/.test(first) && Number(first) <= options.length) idx = Number(first) - 1;
      if (idx >= 0) q.correct = idx;
      else warn(label + ': the correct answer "' + correctRaw + '" does not match any option — please tick it yourself.');
    } else if (part.correctIndex != null && part.correctIndex < options.length) {
      q.correct = part.correctIndex;
    } else {
      warn(label + ' has no correct answer — please tick it yourself.');
    }
  } else if (type === 'truefalse') {
    q.options = ['True', 'False'];
    if (/^(true|t|yes)$/i.test(correctRaw)) q.correct = 0;
    else if (/^(false|f|no)$/i.test(correctRaw)) q.correct = 1;
    else warn(label + ' has no True/False answer — please tick it yourself.');
  } else if (type === 'short' || type === 'fillblank') {
    const acc = correctRaw.split(/\n|\||;/).map(x => x.trim()).filter(Boolean);
    q.accepted = acc.join(', ');
    if (!acc.length) warn(label + ' has no accepted answer, so it can’t be auto-checked.');
  }
  return q;
}

// ── Excel / CSV ──
const RE_OPT = /^(?:option|choice|answer)?\s*[:\-]?\s*\(?([a-h1-8])\)?$/i;
const RE_OPT_STRICT = /^(?:option|choice)\s*[:\-]?\s*([a-h1-8])$/i;

export function parseSheetRows(rows, warn) {
  let h = rows.findIndex(r => (r || []).some(c => /^question(s)?(\s*text)?$/i.test(String(c).trim())));
  if (h < 0) throw new Error('Could not find a "Question" column. The first row must have headings like: Type, Question, Option A, Option B, Option C, Option D, Correct Answer, Points. Use "Download Excel template" for an example.');
  const head = rows[h].map(c => String(c == null ? '' : c).trim());
  const col = { q: -1, type: -1, correct: -1, points: -1, opts: [] };
  head.forEach((c, i) => {
    if (/^question(s)?(\s*text)?$/i.test(c)) col.q = i;
    else if (/^(question\s*)?type$/i.test(c)) col.type = i;
    else if (/^(correct|right|key)(\s*(answer|option|key))?s?$|^answers?$|^answer\s*key$/i.test(c)) col.correct = i;
    else if (/point|mark|score/i.test(c)) col.points = i;
    else {
      const m = c.match(RE_OPT_STRICT) || (c.length <= 2 ? c.match(RE_OPT) : null);
      if (m) col.opts.push({ i, k: m[1].toUpperCase() });
    }
  });
  col.opts.sort((a, b) => a.i - b.i);
  const out = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const cell = i => i >= 0 && row[i] != null ? String(row[i]).trim() : '';
    if (!cell(col.q)) continue;
    const q = build({
      typeRaw: cell(col.type), text: cell(col.q),
      options: col.opts.map(o => cell(o.i)), correctRaw: cell(col.correct), points: cell(col.points)
    }, warn);
    if (q) out.push(q);
    if (out.length >= MAX_QUESTIONS) { warn('Stopped after ' + MAX_QUESTIONS + ' questions.'); break; }
  }
  return out;
}

// ── Word (plain text from the document) ──
// Expected layout (blank lines between questions are optional):
//   1. What is a LAN?
//   a) Local Area Network
//   b) Wide Area Network *            <- a trailing * marks the correct option, or use:
//   Answer: A
//   Points: 2                         <- optional
const RE_Q = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-]\s*(.+)$/i;
const RE_OPTION = /^\(?([A-Ha-h])[.)]\s*(.+)$/;
const RE_ANS = /^(?:correct\s*answer|answer|ans|correct|key)\s*[:=\-]\s*(.+)$/i;
const RE_PTS = /^(?:points?|marks?)\s*[:=]\s*(\d+(?:\.\d+)?)/i;
const RE_TYPE = /^type\s*[:=]\s*(.+)$/i;

export function parseWordText(text, warn) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\u00a0/g, ' ').trim());
  const parts = []; let cur = null;
  const flush = () => { if (cur) parts.push(cur); cur = null; };
  for (const line of lines) {
    if (!line) continue;
    let m;
    if ((m = line.match(RE_ANS)) && cur) { cur.correctRaw = m[1].trim(); continue; }
    if ((m = line.match(RE_PTS)) && cur) { cur.points = m[1]; continue; }
    if ((m = line.match(RE_TYPE)) && cur) { cur.typeRaw = m[1]; continue; }
    if ((m = line.match(RE_OPTION)) && cur) {
      let t = m[2].trim(), star = false;
      if (/(\*|✓|✔|\(correct\))\s*$/i.test(t)) { star = true; t = t.replace(/\s*(\*|✓|✔|\(correct\))\s*$/i, '').trim(); }
      cur.options.push(t);
      if (star) cur.correctIndex = cur.options.length - 1;
      continue;
    }
    if ((m = line.match(RE_Q)) && !(cur && cur.options.length === 0 && /^\d+$/.test(m[2]))) {
      flush(); cur = { text: m[2].trim(), options: [], correctRaw: '', correctIndex: null, points: '', typeRaw: '' }; continue;
    }
    if (cur && !cur.options.length) cur.text += ' ' + line;   // question wrapped over two lines
  }
  flush();
  if (!parts.length) throw new Error('No questions found. In Word, number each question (1. 2. 3.), put options on separate lines (a) b) c) d)), and add a line like "Answer: B" under each question. Or use the Excel template.');
  const out = [];
  for (const p of parts) {
    const q = build(p, warn);
    if (q) out.push(q);
    if (out.length >= MAX_QUESTIONS) { warn('Stopped after ' + MAX_QUESTIONS + ' questions.'); break; }
  }
  return out;
}

// ── public API ──
export async function importQuestionsFromFile(file) {
  if (!file) throw new Error('No file was chosen.');
  if (file.size > MAX_BYTES) throw new Error('That file is too large (limit 8 MB).');
  const name = file.name.toLowerCase();
  const warnings = [];
  const warn = w => warnings.push(w);
  let questions;
  if (/\.docx$/.test(name)) {
    const mammoth = await loadScript(MAMMOTH, 'mammoth');
    const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    questions = parseWordText(res.value, warn);
  } else if (/\.(xlsx|xls|csv)$/.test(name)) {
    const XLSX = await loadScript(SHEETJS, 'XLSX');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    questions = parseSheetRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }), warn);
  } else if (/\.doc$/.test(name)) {
    throw new Error('Old .doc files are not supported. In Word choose File → Save As → Word Document (.docx), then try again.');
  } else {
    throw new Error('Please choose a Word (.docx) or Excel (.xlsx, .xls, .csv) file.');
  }
  if (!questions.length) throw new Error('No questions were found in that file.');
  return { questions, warnings };
}

export async function downloadQuestionTemplate() {
  const XLSX = await loadScript(SHEETJS, 'XLSX');
  const rows = [
    ['Type', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Points'],
    ['Multiple choice', 'What does LAN stand for?', 'Local Area Network', 'Large Area Network', 'Long Access Network', 'Linked Area Node', 'A', 1],
    ['True/False', 'The sun rises in the west.', '', '', '', '', 'False', 1],
    ['Short answer', 'Which part of the computer is called its brain?', '', '', '', '', 'CPU | processor', 2],
    ['Fill in the blank', 'The capital of Bhutan is ____.', '', '', '', '', 'Thimphu', 1],
    ['Paragraph', 'Explain why backups are important.', '', '', '', '', '', 5]
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 46 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  XLSX.writeFile(wb, 'SherigSpace-question-template.xlsx');
}