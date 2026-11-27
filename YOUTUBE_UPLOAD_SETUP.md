# Contributors upload straight to your YouTube channel (+ make videos interactive)

## What contributors get
- **Contribute → Video → 📤 Upload a file**: the video goes from their browser straight to **your YouTube channel** as an **Unlisted** video (only people with the link can watch it; it does not appear on your public channel page). It goes live on SherigSpace only when you press **Approve & publish** in Admin → Contributions.
- **⚡ Make it interactive**: contributors can add questions to their video. They play the video, pause where they want a question, press **📍 Use current time**, then type the question and answers and tick the correct one. (For a pasted YouTube link they type the time, e.g. 01:20.)
- In **Admin → Contributions** you see the questions under the video. When you approve, the video is published **and** its questions are saved, so it appears in **Interactive Videos** automatically. Interactive videos need YouTube (the player uses YouTube), which is why uploads go there.

If the YouTube upload is not set up, the Contribute form keeps working exactly as before (Google Drive upload, or a pasted link). Contributors can still make a **pasted YouTube link** interactive.

## Set up once (about 20 minutes)

### 1. Database (30 seconds)
Supabase → SQL Editor → run **CONTRIB_YOUTUBE_SETUP.sql**.

### 2. Google Cloud
1. https://console.cloud.google.com → open your **SherigSpace** project (the same one used for Drive).
2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**.
3. **OAuth consent screen**: keep the app **In production** (if it is in "Testing", Google stops the connection after 7 days).
4. **Credentials**: use your existing OAuth client (it already has `https://developers.google.com/oauthplayground` as a redirect address). Copy the **Client ID** and **Client secret**.

### 3. Get the YouTube refresh token
1. Open https://developers.google.com/oauthplayground → ⚙ → tick **Use your own OAuth credentials** → paste the Client ID and secret.
2. In the left box type `https://www.googleapis.com/auth/youtube.upload` → **Authorize APIs**.
3. Sign in with the Google account that **owns your YouTube channel** (if asked which channel, choose your SherigSpace channel). Google may warn "app not verified" — choose **Advanced → continue** (it is your own app).
4. **Exchange authorization code for tokens** → copy the **Refresh token**.

### 4. Give the values to Supabase and deploy
Using the Supabase CLI in your project folder:
```
supabase secrets set YOUTUBE_CLIENT_ID=xxxx YOUTUBE_CLIENT_SECRET=xxxx YOUTUBE_REFRESH_TOKEN=xxxx
supabase functions deploy youtube-upload
```
Optional: `YOUTUBE_MAX_MB=500` (largest video), `YOUTUBE_MADE_FOR_KIDS=true` (see below), `CONTRIB_MAX_PER_DAY=5`, `CONTRIB_MAX_PENDING=3`.

### 5. Upload the website files
`index.html`, `admin.html` and the new `youtube-upload.js` (keep it next to `index.html`).

## Test
Log in as a normal user → Contribute → Video → choose a small video → tick **Make it interactive** → add one question → Submit. Check YouTube Studio → Content: the video should be there as **Unlisted**. Then Admin → Contributions → Approve & publish → open **Interactive Videos** on the site.

## Good to know
- **Check the first upload's visibility.** Google has had a rule that videos uploaded through the API by an unverified project are locked to *Private*. Google's newest notes say this restriction was lifted, but older pages still mention it. If your test video shows as **Private** (not Unlisted) in YouTube Studio, it cannot play on the site until your project passes Google's free *YouTube API Services audit* (form: "YouTube API Services – Audit and Quota Extension Form").
- **Daily limit.** Google is moving uploads to their own quota (default about 100 uploads a day for the whole project); older projects may still count about 1,600 units per upload (roughly 6 a day). The site shows a friendly "try again tomorrow" message if the limit is reached. You can see usage in Google Cloud → APIs & Services → Quotas.
- **"Made for kids".** YouTube requires every video to be marked. The default here is **not made for kids**. If most of your content is children's content, set `YOUTUBE_MADE_FOR_KIDS=true` (it limits comments and some features on those videos).
- **Rejected videos stay on your channel** as Unlisted. The site cannot delete them (that needs a stronger permission), so remove them in YouTube Studio when you reject something.
- **Safety:** your YouTube login details stay only in Supabase secrets. Contributors never receive them — they only get a one-time upload address. Each person is limited to the same pending/daily limits as before.
