# Video uploads to your Google Drive

## Two levels
**Level 1 — works as soon as you upload the website files (no setup).** Contributors and you use the same Google Drive upload your admin page already uses (`DRIVE_UPLOAD_URL` in `config.js`). Limit: **25 MB per video**. Longer videos: they use the "YouTube / link" option.

**Level 2 — optional upgrade (this guide).** Deploy the `drive-upload` function to allow **videos up to 300 MB**, and keep contributors' videos **private until you press Approve & publish**. Takes about 15 minutes, once. The site switches to it automatically as soon as it is deployed.

What Level 2 gives you
- **Contribute form**: people can pick a video file; it goes straight into a folder called **SherigSpace Contributions** in *your* Google Drive. It stays **private** until you press **Approve & publish** in Admin → Contributions (then it becomes "anyone with the link can view" and plays on the site).
- **Admin → Add video**: a button **📤 Upload video to Google Drive** puts the file in **SherigSpace Admin Uploads**, makes it viewable by link, and fills in the video link for you.
- The files use **your** Drive storage (15 GB on a free Google account).

## 1. Google Cloud (free)
1. Go to https://console.cloud.google.com → create a project (e.g. "SherigSpace").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → User type **External** → fill the app name and your email → Save.
   Then press **Publish app** (so it is "In production"). *If you leave it in "Testing", Google stops the connection after 7 days.* The only permission used is `drive.file`, which needs no Google review.
4. **APIs & Services → Credentials** → open your existing OAuth client (or **Create credentials → OAuth client ID** → type **Web application**) →
   under *Authorized redirect URIs* add `https://developers.google.com/oauthplayground` → Create.
   Copy the **Client ID** and **Client secret**.

## 2. Get the refresh token
1. Open https://developers.google.com/oauthplayground
2. Click the ⚙ (top right) → tick **Use your own OAuth credentials** → paste your Client ID and Client secret.
3. In the left box type this permission and press **Authorize APIs**:
   `https://www.googleapis.com/auth/drive.file`
   Sign in with the Google account whose Drive should receive the videos and allow it.
4. Press **Exchange authorization code for tokens** → copy the **Refresh token**.

## 3. Give the three values to Supabase, then deploy the function
Using the Supabase CLI in your project folder:
```
supabase secrets set GOOGLE_CLIENT_ID=xxxx GOOGLE_CLIENT_SECRET=xxxx GOOGLE_REFRESH_TOKEN=xxxx
supabase functions deploy drive-upload
```
(Optional: `supabase secrets set DRIVE_MAX_MB=500` to change the 300 MB limit.)

## 4. Upload the website files
Upload the new `index.html`, `admin.html` and `video-drive-upload.js` (keep it in the same folder as `index.html`). Your existing `drive-upload.js` stays as it is.

## Test
Log in as a normal user → Contribute → Video → choose a small video → Submit. Check Google Drive → *SherigSpace Contributions*.
Then Admin → Contributions → Approve & publish → the video should play on the site.
