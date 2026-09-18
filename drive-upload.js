// ── Google Drive upload helper (admin.html only) ──
// Uses Google Identity Services (GIS) for a one-time consent popup, then
// the Drive REST API directly (no heavy SDK) to upload a file, make it
// viewable via link, and hand back a thumbnail + view URL to store.
//
// Scope used: drive.file — this app can only see/manage files IT
// creates, never your whole Drive. Requires admin.html to include:
//   <script src="https://accounts.google.com/gsi/client" async defer></script>

let tokenClient = null;
let currentToken = null;
let tokenExpiresAt = 0;

function waitForGis(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Google sign-in script did not load. Check your internet connection and try again.'));
      setTimeout(poll, 100);
    })();
  });
}

async function ensureDriveToken(clientId) {
  const now = Date.now();
  if (currentToken && now < tokenExpiresAt - 5000) return currentToken;

  await waitForGis();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: () => {} // overridden per-call below
    });
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      currentToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
      resolve(currentToken);
    };
    // 'consent' the first time in a session; GIS will auto-skip the
    // prompt on later calls once the user has already approved access.
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function driveUploadRaw(file, token, folderId) {
  const metadata = { name: file.name };
  if (folderId) metadata.parents = [folderId];

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!res.ok) throw new Error('Drive upload failed (' + res.status + ')');
  return res.json(); // { id, name }
}

async function driveMakePublic(fileId, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
  if (!res.ok) throw new Error('Could not make the file link-viewable (' + res.status + ')');
}

/**
 * Uploads a file (image, PDF, slides, doc, video — anything) to the signed-in
 * user's Google Drive, makes it link-viewable, and returns URLs to store on
 * a lesson/resource/video/article.
 *
 * Note: this is completely separate from user login/accounts, which stay
 * entirely in Supabase (see config.js / login.html). This only asks for
 * permission to manage files IT uploads (drive.file scope) — it has no
 * access to your Drive's existing files, and no relationship to your
 * site's users, sessions, or roles.
 *
 * @returns {Promise<{fileId:string, viewUrl:string, thumbnailUrl:string, name:string}>}
 */
export async function uploadFileToDrive(file, clientId, folderId) {
  if (!clientId || clientId.startsWith('YOUR_')) {
    throw new Error('Google Drive is not configured yet — set GOOGLE_CLIENT_ID in config.js first.');
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Please choose a file under 50MB.');
  }

  const token = await ensureDriveToken(clientId);
  const uploaded = await driveUploadRaw(file, token, folderId);
  await driveMakePublic(uploaded.id, token);

  return {
    fileId: uploaded.id,
    name: uploaded.name,
    viewUrl: `https://drive.google.com/file/d/${uploaded.id}/view`,
    // Drive generates a preview image for most file types it can render
    // (images, PDFs, Office docs, video frames) — not just photos.
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${uploaded.id}&sz=w600`
  };
}
