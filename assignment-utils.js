// ── Shared helpers for assignment resources & questions ──
// Loaded by teacher.html (to build tasks) and student.html (to show them),
// so both pages agree on what a "video", "document", "link" etc. is.

import { safeUrl } from './config.js';

export const KIND_META = {
  video: { icon: '🎥', label: 'Video' },
  doc:   { icon: '📄', label: 'Document' },
  file:  { icon: '📎', label: 'File' },
  image: { icon: '🖼️', label: 'Image' },
  audio: { icon: '🎧', label: 'Audio' },
  form:  { icon: '📝', label: 'Form' },
  link:  { icon: '🔗', label: 'Link' }
};

const IMG = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const AUD = /\.(mp3|wav|m4a|ogg|aac)$/i;
const VID = /\.(mp4|webm|mov|m4v)$/i;
const FILE = /\.(pdf|docx?|pptx?|xlsx?|odt|odp|ods|txt|csv|zip)$/i;

/**
 * Works out what a URL is and how a student can best use it.
 * Returns { kind, host, name, embed, media, download }
 *   kind     – video | doc | file | image | audio | form | link
 *   embed    – a SAFE iframe URL (only for hosts we know: YouTube, Vimeo, Google) or null
 *   media    – 'video' | 'audio' | 'image' when the browser can play it natively
 *   download – direct-download URL (Google Drive files only) or null
 */
export function classifyUrl(url) {
  const out = { kind: 'link', host: String(url), name: '', embed: null, media: null, download: null };
  let u;
  try { u = new URL(url); } catch (e) { return out; }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;
  out.host = host;

  // YouTube / Vimeo
  let yt = null;
  if (host === 'youtu.be') yt = path.slice(1).split('/')[0];
  else if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    if (path === '/watch') yt = u.searchParams.get('v');
    else { const m = path.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/); if (m) yt = m[1]; }
  }
  if (yt && /^[\w-]{6,}$/.test(yt)) {
    out.kind = 'video'; out.name = 'YouTube video';
    out.embed = 'https://www.youtube-nocookie.com/embed/' + yt;
    return out;
  }
  if (host === 'vimeo.com') {
    const m = path.match(/^\/(\d+)/);
    if (m) { out.kind = 'video'; out.name = 'Vimeo video'; out.embed = 'https://player.vimeo.com/video/' + m[1]; return out; }
  }

  // Google Drive file
  if (host === 'drive.google.com') {
    let id = null;
    const m = path.match(/\/file\/d\/([\w-]+)/);
    if (m) id = m[1];
    else if ((path === '/open' || path === '/uc') && u.searchParams.get('id')) id = u.searchParams.get('id');
    if (id && /^[\w-]+$/.test(id)) {
      out.kind = 'file'; out.name = 'Google Drive file';
      out.embed = 'https://drive.google.com/file/d/' + id + '/preview';
      out.download = 'https://drive.google.com/uc?export=download&id=' + id;
    }
    return out; // folders etc. stay plain links
  }

  // Google Docs / Slides / Sheets / Forms
  if (host === 'docs.google.com') {
    if (/^\/forms\//.test(path)) {
      out.kind = 'form'; out.name = 'Google Form';
      const e = new URL(u.href); e.searchParams.set('embedded', 'true');
      out.embed = e.href;
      return out;
    }
    const names = { document: 'Google Doc', presentation: 'Google Slides', spreadsheets: 'Google Sheet' };
    const m = path.match(/^\/(document|presentation|spreadsheets)\/d\/([\w-]+)/);
    if (m) {
      out.kind = 'doc'; out.name = names[m[1]];
      if (m[2] === 'e') out.embed = u.href;                                   // "published to the web" link
      else if (m[1] === 'document') out.embed = `https://docs.google.com/document/d/${m[2]}/preview`;
      else if (m[1] === 'presentation') out.embed = `https://docs.google.com/presentation/d/${m[2]}/embed`;
      else out.embed = `https://docs.google.com/spreadsheets/d/${m[2]}/preview`;
      return out;
    }
  }

  // Plain files on any other website
  if (IMG.test(path)) { out.kind = 'image'; out.media = 'image'; return out; }
  if (AUD.test(path)) { out.kind = 'audio'; out.media = 'audio'; return out; }
  if (VID.test(path)) { out.kind = 'video'; out.media = 'video'; return out; }
  if (FILE.test(path)) { out.kind = 'file'; return out; }
  return out;
}

/** A friendly default title for an attachment when the teacher doesn't type one. */
export function defaultLabel(url) {
  const c = classifyUrl(url);
  if (c.name) return c.name;
  let last = '';
  try { last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch (e) {}
  if (/\.[a-z0-9]{2,5}$/i.test(last)) return last;
  return c.host;
}

/**
 * Reads an assignment/library row's attachments.
 * New tasks store [{url,label,type}] in `attachments`; older tasks only have
 * `attachment_url` (one link per line) — both are understood.
 */
export function parseAttachments(row) {
  if (!row) return [];
  if (Array.isArray(row.attachments) && row.attachments.length) {
    return row.attachments
      .map(x => ({ url: safeUrl(x && x.url), label: String((x && x.label) || ''), type: String((x && x.type) || '') }))
      .filter(x => x.url);
  }
  return String(row.attachment_url || '').split(/\s*\n\s*/).map(safeUrl).filter(Boolean)
    .map(url => ({ url, label: '', type: '' }));
}

/** Reads an assignment's questions: [{ id, type: short|long|choice, text, options[] }] */
export function parseQuestions(row) {
  const raw = row && row.questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(q => q && q.id && q.text)
    .map(q => ({
      id: String(q.id),
      type: ['short', 'long', 'choice'].includes(q.type) ? q.type : 'short',
      text: String(q.text),
      options: Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : []
    }));
}
