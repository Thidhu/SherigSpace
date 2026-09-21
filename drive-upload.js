// ── Google Drive upload helper ──
//
// Scope: 'drive.file'. This is the narrow, non-sensitive permission — the app can
// only touch files and folders IT created, never the rest of a teacher's Drive.
// Because it is non-sensitive, the Google Cloud app can be set to "In production"
// with no test-user list and no Google verification review.
//
// Since the app can only see what it created, it can't use a folder you made by
// hand. Instead, the first upload creates a folder called "SherigSpace Uploads"
// in the signed-in teacher's own Drive, and every later upload goes into it.

const APP_FOLDER_NAME = 'SherigSpace Uploads';
let appFolderId = null;

import * as cfg from './config.js';

// ── Central-Drive mode ──────────────────────────────────────────
// When DRIVE_UPLOAD_URL is set in config.js, uploads no longer use a Google
// popup at all. The file is sent to your Google Apps Script (drive-upload-backend.gs),
// which runs as YOU and saves it into your own Drive folder. Teachers never sign
// in to Google. If DRIVE_UPLOAD_URL is empty, the older popup method below is used.
const BACKEND_MAX_BYTES = 25 * 1024 * 1024;
let supa = null;
let tokenProvider = defaultTokenProvider;

export function usingBackend() { return !!cfg.DRIVE_UPLOAD_URL; }
export function _setTokenProvider(fn) { tokenProvider = fn; }   // for tests

async function defaultTokenProvider() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  supa = supa || createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const { data } = await supa.auth.getSession();
  if (!data || !data.session) throw new Error('Please log in again, then retry the upload.');
  return data.session.access_token;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

async function uploadViaBackend(file) {
  if (file.size > BACKEND_MAX_BYTES) throw new Error('Please choose a file under 25MB. For a longer video, put it on YouTube as Unlisted and paste the link.');
  const token = await tokenProvider();
  const data = await fileToBase64(file);

  let response;
  try {
    response = await fetch(cfg.DRIVE_UPLOAD_URL, {
      method: 'POST',
      // text/plain keeps this a "simple" request, so the browser doesn't need a CORS pre-check
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, name: file.name, mimeType: file.type, data })
    });
  } catch (e) {
    throw new Error('Could not reach the upload service. Check DRIVE_UPLOAD_URL in config.js, and that the script is deployed with access set to "Anyone".');
  }
  let out;
  try { out = JSON.parse(await response.text()); }
  catch (e) { throw new Error('The upload service sent an unexpected reply. Check that the script is deployed as a Web app with access set to "Anyone".'); }
  if (!out.ok) throw new Error(out.error || 'Upload failed.');

  return {
    fileId: out.fileId,
    name: out.name,
    viewUrl: out.viewUrl,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${out.fileId}&sz=w600`
  };
}

let tokenClient = null;
let currentToken = null;
let tokenExpiresAt = 0;
let gisReadyPromise = null;

function waitForGis(timeoutMs = 10000) {
  if (gisReadyPromise) return gisReadyPromise;

  gisReadyPromise = new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Google Identity Services could not load. Please refresh the page and try again.'));
        return;
      }
      setTimeout(check, 100);
    }
    check();
  });

  return gisReadyPromise;
}

// The one sign-in request currently waiting on Google's popup (if any).
let pending = null;

function settle(fn, value) {
  if (!pending) return;
  const p = pending;
  pending = null;
  clearTimeout(p.timer);
  fn === 'resolve' ? p.resolve(value) : p.reject(value);
}

async function initGoogle(clientId) {
  await waitForGis();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error) {
          settle('reject', new Error(response.error_description || response.error || 'Google authorization failed.'));
          return;
        }
        if (!response.access_token) {
          settle('reject', new Error('Google did not return an access token.'));
          return;
        }
        currentToken = response.access_token;
        appFolderId = null;
        tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
        settle('resolve', currentToken);
      },
      // Without this, a blocked or closed popup NEVER calls `callback`, so the
      // page just sat on "Uploading…" forever.
      error_callback: (err) => {
        const messages = {
          popup_failed_to_open: 'The Google sign-in popup was blocked by the browser. Allow popups for this site (icon in the address bar) and try again.',
          popup_closed: 'The Google sign-in window was closed before it finished. If it showed an error page (e.g. "origin_mismatch" or "Access blocked"), the Google Cloud OAuth settings need fixing.'
        };
        settle('reject', new Error(messages[err && err.type] || ('Google sign-in failed: ' + ((err && (err.type || err.message)) || 'unknown error'))));
      }
    });
  }

  return tokenClient;
}

/** True if we already hold a Google token that is not about to expire. */
export function hasValidDriveToken() {
  if (usingBackend()) return true;
  return !!currentToken && Date.now() < tokenExpiresAt - 10000;
}

/**
 * Gets a Drive access token. IMPORTANT: when a new token is needed this opens
 * a popup, so it must be called straight from a real click (not from a file
 * input's change event) or the browser will block the popup.
 */
export async function connectGoogleDrive(clientId) {
  if (usingBackend()) return 'backend';
  if (hasValidDriveToken()) return currentToken;

  const client = await initGoogle(clientId);

  return new Promise((resolve, reject) => {
    // Give up after 2 minutes instead of waiting forever.
    const timer = setTimeout(() => {
      settle('reject', new Error('Google sign-in timed out. Please try again.'));
    }, 120000);
    pending = { resolve, reject, timer };
    client.requestAccessToken({ prompt: '' });
  });
}

async function getDriveToken(clientId) {
  return connectGoogleDrive(clientId);
}

async function driveUploadRaw(file, token, folderId) {
  const metadata = { name: file.name };
  if (folderId) metadata.parents = [folderId];

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error('Google Drive upload error:', response.status, responseText);
    throw new Error(`Google Drive upload failed (${response.status}): ${responseText}`);
  }
  return JSON.parse(responseText);
}

async function driveMakePublic(fileId, token) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error('Google Drive permission error:', response.status, responseText);
    throw new Error(`Could not make file public (${response.status}): ${responseText}`);
  }
}

/** Finds (or creates) the "SherigSpace Uploads" folder this app owns in the teacher's Drive. */
async function getAppFolder(token) {
  if (appFolderId) return appFolderId;
  const auth = { Authorization: `Bearer ${token}` };

  const q = encodeURIComponent(`name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  let response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, { headers: auth });
  let text = await response.text();
  if (!response.ok) throw new Error(`Could not look for the upload folder (${response.status}): ${text}`);
  const found = JSON.parse(text).files;
  if (found && found.length) { appFolderId = found[0].id; return appFolderId; }

  response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });
  text = await response.text();
  if (!response.ok) throw new Error(`Could not create the upload folder (${response.status}): ${text}`);
  appFolderId = JSON.parse(text).id;
  return appFolderId;
}

/**
 * Uploads a file into the "SherigSpace Uploads" folder of the signed-in
 * teacher's Google Drive, makes it link-viewable, and returns URLs to store.
 * (The third argument is ignored now — kept so older calls still work.)
 */
export async function uploadFileToDrive(file, clientId /*, folderId (unused) */) {
  if (!file) {
    throw new Error('No file was selected.');
  }
  if (usingBackend()) return uploadViaBackend(file);
  if (!clientId || clientId.startsWith('YOUR_')) {
    throw new Error('Google Drive is not configured. Check GOOGLE_CLIENT_ID in config.js.');
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Please choose a file under 50MB.');
  }

  const token = await getDriveToken(clientId);
  let uploaded;
  try {
    uploaded = await driveUploadRaw(file, token, await getAppFolder(token));
  } catch (err) {
    // The teacher may have deleted the folder since it was cached — recreate it once.
    if (!/\(404\)/.test(String(err.message))) throw err;
    appFolderId = null;
    uploaded = await driveUploadRaw(file, token, await getAppFolder(token));
  }
  await driveMakePublic(uploaded.id, token);

  return {
    fileId: uploaded.id,
    name: uploaded.name,
    viewUrl: `https://drive.google.com/file/d/${uploaded.id}/view`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${uploaded.id}&sz=w600`
  };
}
