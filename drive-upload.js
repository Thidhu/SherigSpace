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

async function initGoogle(clientId) {
  await waitForGis();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      // Broadened from 'drive.file' — see note at top of file.
      scope: 'https://www.googleapis.com/auth/drive',
      callback: () => {}
    });
  }

  return tokenClient;
}

async function getDriveToken(clientId) {
  const now = Date.now();

  // Reuse existing token if it's not close to expiring.
  if (currentToken && now < tokenExpiresAt - 10000) {
    return currentToken;
  }

  const client = await initGoogle(clientId);

  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error || 'Google authorization failed.'));
        return;
      }
      if (!response.access_token) {
        reject(new Error('Google did not return an access token.'));
        return;
      }
      currentToken = response.access_token;
      tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
      resolve(currentToken);
    };

    // 'consent' the first time (and the first time after broadening the
    // scope); after that, Google will typically skip the prompt.
    client.requestAccessToken({ prompt: '' });
  });
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
