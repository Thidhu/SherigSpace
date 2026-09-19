// ── Google Drive upload helper ──

let tokenClient = null;
let currentToken = null;
let tokenExpiresAt = 0;
let gisReadyPromise = null;

function waitForGis(timeoutMs = 10000) {
  if (gisReadyPromise) return gisReadyPromise;

  gisReadyPromise = new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      if (
        window.google &&
        window.google.accounts &&
        window.google.accounts.oauth2
      ) {
        resolve();
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            'Google Identity Services could not load. Please refresh the page and try again.'
          )
        );
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
      scope: 'https://www.googleapis.com/auth/drive.file',

      callback: () => {}
    });
  }

  return tokenClient;
}

async function getDriveToken(clientId) {
  const now = Date.now();

  // Reuse existing token
  if (currentToken && now < tokenExpiresAt - 10000) {
    return currentToken;
  }

  const client = await initGoogle(clientId);

  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      console.log('Google OAuth response:', response);

      if (response.error) {
        reject(
          new Error(
            response.error_description ||
            response.error ||
            'Google authorization failed.'
          )
        );
        return;
      }

      if (!response.access_token) {
        reject(new Error('Google did not return an access token.'));
        return;
      }

      currentToken = response.access_token;

      tokenExpiresAt =
        Date.now() +
        (Number(response.expires_in) || 3600) * 1000;

      resolve(currentToken);
    };

    // Ask for consent when authorization has not been granted yet.
    client.requestAccessToken({
      prompt: 'consent'
    });
  });
}

async function driveUploadRaw(file, token, folderId) {

  const metadata = {
    name: file.name
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const form = new FormData();

  form.append(
    'metadata',
    new Blob(
      [JSON.stringify(metadata)],
      { type: 'application/json' }
    )
  );

  form.append('file', file);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${token}`
      },

      body: form
    }
  );

  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      'Google Drive upload error:',
      response.status,
      responseText
    );

    throw new Error(
      `Google Drive upload failed (${response.status}): ${responseText}`
    );
  }

  return JSON.parse(responseText);
}

async function driveMakePublic(fileId, token) {

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    }
  );

  const responseText = await response.text();

  if (!response.ok) {

    console.error(
      'Google Drive permission error:',
      response.status,
      responseText
    );

    throw new Error(
      `Could not make file public (${response.status}): ${responseText}`
    );
  }
}

export async function uploadFileToDrive(
  file,
  clientId,
  folderId
) {

  if (!clientId || clientId.startsWith('YOUR_')) {
    throw new Error(
      'Google Drive is not configured. Check GOOGLE_CLIENT_ID in config.js.'
    );
  }

  if (!file) {
    throw new Error('No file was selected.');
  }

  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Please choose a file under 50MB.');
  }

  if (!folderId) {
    throw new Error(
      'Google Drive folder ID is missing.'
    );
  }

  console.log('Starting Google Drive upload...');
  console.log('File:', file.name);
  console.log('Size:', file.size);
  console.log('Folder:', folderId);

  const token = await getDriveToken(clientId);

  console.log('Google access token received.');

  const uploaded = await driveUploadRaw(
    file,
    token,
    folderId
  );

  console.log(
    'File uploaded:',
    uploaded
  );

  await driveMakePublic(
    uploaded.id,
    token
  );

  console.log(
    'File permission updated.'
  );

  return {
    fileId: uploaded.id,

    name: uploaded.name,

    viewUrl:
      `https://drive.google.com/file/d/${uploaded.id}/view`,

    thumbnailUrl:
      `https://drive.google.com/thumbnail?id=${uploaded.id}&sz=w600`
  };
}
