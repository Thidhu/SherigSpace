// ── Shared config for SherigSpace ──
// Loaded by index.html, login.html and admin.html so the Supabase
// URL/key and small helper functions only live in one place.

export const SUPABASE_URL = 'https://kgqlcjdjdhssactfezwi.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtncWxjamRqZGhzc2FjdGZlendpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTE2MzQsImV4cCI6MjA5NTAyNzYzNH0.6hJpg9Zput8wnuDfq7wzb5dRC2KkuRmkmaz870U0Lto';

// Escape any string before dropping it into innerHTML. Every field that
// came from the database (titles, descriptions, comments, etc.) must be
// passed through this before being rendered, since anyone able to write
// a row (see RLS notes) could otherwise inject a script tag.
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow http(s) URLs to be used in href/onclick/window.open — blocks
// "javascript:" and other schemes that could execute code if a bad URL
// ever made it into the database.
export function safeUrl(u) {
  if (!u) return '';
  try {
    const parsed = new URL(u, window.location.href);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (e) { /* invalid URL */ }
  return '';
}
