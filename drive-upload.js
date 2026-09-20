// ── Google Drive upload helper ──
//
// Scope note: this uses the full 'drive' scope (not the narrower
// 'drive.file') specifically so uploads can land inside a folder you
// picked yourself in Drive's UI. With 'drive.file', the app can only
// see files/folders IT created — a folder you made manually and pasted
// the ID for is invisible to it, which is why uploads into
// GOOGLE_DRIVE_FOLDER_ID were failing. Full 'drive' scope fixes that.
//
// This is fine while your Google Cloud OAuth consent screen is in
// "Testing" mode with your own account listed as a test user — no
// extra verification needed for that. If you ever open Drive uploads
// up to OTHER teachers using their own separate Google accounts (e.g.
// via teacher.html's assignment attachments), each of those accounts
// would also need to be added as a test user in Google Cloud, or the
// app would need to go through Google's verification process to work
// for arbitrary outside accounts.

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
      // Broadened from 'drive.file' — see note at top of file.
      scope: 'https://www.googleapis.com/auth/drive',
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
  return !!currentToken && Date.now() < tokenExpiresAt - 10000;
}

/**
 * Gets a Drive access token. IMPORTANT: when a new token is needed this opens
 * a popup, so it must be called straight from a real click (not from a file
 * input's change event) or the browser will block the popup.
 */
export async function connectGoogleDrive(clientId) {
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

/**
 * Uploads a file to the signed-in user's Google Drive (optionally into a
 * specific folder), makes it link-viewable, and returns URLs to store.
 */
export async function uploadFileToDrive(file, clientId, folderId) {
  if (!clientId || clientId.startsWith('YOUR_')) {
    throw new Error('Google Drive is not configured. Check GOOGLE_CLIENT_ID in config.js.');
  }
  if (!file) {
    throw new Error('No file was selected.');
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Please choose a file under 50MB.');
  }
  // folderId is optional again — an empty/missing value just uploads to
  // Drive's root instead of failing outright.

  const token = await getDriveToken(clientId);
  const uploaded = await driveUploadRaw(file, token, folderId);
  await driveMakePublic(uploaded.id, token);

  return {
    fileId: uploaded.id,
    name: uploaded.name,
    viewUrl: `https://drive.google.com/file/d/${uploaded.id}/view`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${uploaded.id}&sz=w600`
  };
}
