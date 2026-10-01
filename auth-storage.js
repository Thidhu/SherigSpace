// Shares the Supabase login between sherigspace.com and its subdomains
// (e.g. tugofwar.sherigspace.com) by keeping the session in a cookie scoped to
// .sherigspace.com instead of per-origin localStorage. Large sessions are split
// into 3KB chunks because a single cookie is limited to ~4KB.
// Falls back to localStorage on any other host (localhost, previews) and reads
// an existing localStorage session once, so nobody is logged out by the change.
const CHUNK = 3000;
const host = location.hostname;
const onSite = host === 'sherigspace.com' || host.endsWith('.sherigspace.com');
const domain = onSite ? '; domain=.sherigspace.com' : '';
const base = '; path=/; max-age=31536000; samesite=lax' + (location.protocol === 'https:' ? '; secure' : '');

function readCookie(name) {
  const m = document.cookie.split('; ').find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function writeCookie(name, value) { document.cookie = name + '=' + encodeURIComponent(value) + domain + base; }
function killCookie(name) { document.cookie = name + '=; max-age=0; path=/' + domain; }

export const authStorage = {
  getItem(key) {
    if (!onSite) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    const n = parseInt(readCookie(key + '.n') || '0', 10);
    if (n > 0) {
      let out = '';
      for (let i = 0; i < n; i++) { const p = readCookie(key + '.' + i); if (p == null) return null; out += p; }
      return out;
    }
    try { return localStorage.getItem(key); } catch (e) { return null; }   // one-time migration
  },
  setItem(key, value) {
    if (!onSite) { try { localStorage.setItem(key, value); } catch (e) {} return; }
    this.removeItem(key, true);
    const parts = value.match(new RegExp('[\\s\\S]{1,' + CHUNK + '}', 'g')) || [''];
    parts.forEach((p, i) => writeCookie(key + '.' + i, p));
    writeCookie(key + '.n', String(parts.length));
  },
  removeItem(key, keepLocal) {
    if (onSite) {
      const n = parseInt(readCookie(key + '.n') || '0', 10);
      for (let i = 0; i < Math.max(n, 6); i++) killCookie(key + '.' + i);
      killCookie(key + '.n');
    }
    if (!keepLocal) { try { localStorage.removeItem(key); } catch (e) {} }
  }
};
export const AUTH_OPTIONS = { auth: { storage: authStorage } };