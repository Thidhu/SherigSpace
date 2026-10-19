# Apps & games protection: controlled from Admin, follows Free Mode

## What you get
In **Admin → Settings**, under **Free Mode**, there is a new card **🔒 Apps & games protection**.

| Free Mode | "Follow Free Mode" (default) | What happens to your GitHub apps |
|---|---|---|
| **ON** (today) | apps are **open** | They open for everyone, even from a copied link. Nothing changes from today. |
| **OFF** | apps are **protected** | They open **only inside sherigspace.com**, and only for the people you choose (below). A copied link shows **Permission denied**. |

You can also choose **Always protect** (even while Free Mode is ON) or **Never protect**.
**Who may open a protected app?** you choose one:
- **Paid members, teachers, admins and students in a teacher's class** (default), or
- **Anyone who is signed in**.

"Paid member" uses the same rules as your website: an approved membership (3 months, plus any bonus days you gave), or an approved Premium Membership. Teachers include people whose teacher plan is active and anyone who owns a class.
This is checked **in the database**, so it cannot be bypassed from the browser.

## Setup (once)
1. **Supabase → SQL Editor** → paste **`APP_CONTROL_SETUP.sql`** → **Run**. Safe to run again. It replaces `APP_ACCESS_SETUP.sql`; if you already ran that one, just run this on top.
2. Upload these three files next to `index.html` on sherigspace.com:
   - `sherig-app-guard.js` (goes inside every app)
   - `app-embed.js` (opens apps in the viewer, applies the rules)
   - `admin-app-control.js` (adds the control card to Admin → Settings)
3. Add **one line** inside `<head>` of `index.html`, `student.html`, `dashboard.html`, `teacher.html` and `admin.html`:
   ```html
   <script src="./app-embed.js"></script>
   ```
4. Add **one line** to `admin.html` (anywhere inside `<body>`, near the end):
   ```html
   <script src="./admin-app-control.js"></script>
   ```
5. **Lock each app once.** In each app's repository, put these three lines first inside `<head>` of every HTML page of the app (usually `index.html`):
   ```html
   <style id="sg-guard-hide">html{visibility:hidden!important}</style>
   <script src="https://sherigspace.com/sherig-app-guard.js"></script>
   <script>setTimeout(function(){if(!window.SherigAppGuard){var d=document,s=d.getElementById('sg-guard-hide');if(s)s.remove();d.title='Cannot verify access';d.documentElement.innerHTML='<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1623;color:#e8e4dc;font-family:system-ui,sans-serif;text-align:center;padding:1.5rem"><div style="max-width:420px"><div style="font-size:3rem">🔒</div><h2 style="color:#c9a84c">Cannot verify access</h2><p style="color:#9aa3b8;line-height:1.6">The security check could not be reached. Please open this app from <a style="color:#c9a84c" href="https://sherigspace.com">sherigspace.com</a>.</p></div></body>'}},5000)</script>
   ```
   An app without these lines cannot be protected: anyone with its address can open it.
   If you already added the three lines in an earlier step, **you do not need to change the apps again**: they load `sherig-app-guard.js` from your site, so they pick up the new rules automatically.

Apps on `*.sherigspace.com` (for example `lpgenerator.sherigspace.com`) are recognised automatically. If your apps are on a `github.io` address, add that exact host near the top of `app-embed.js`: `var TRUSTED_APP_HOSTS = ['yourname.github.io'];` and add the host to `EXTRA_HOSTS` only if it is not on github.io or sherigspace.com.

## Test it (5 minutes)
1. Admin → Settings: leave **Follow Free Mode** selected. **Free Mode ON** → open an app from the site, and also paste its address in a new tab: both open.
2. Turn **Free Mode OFF** (the card's "Right now" line changes to PROTECTED). Wait up to a minute.
3. Open an app from the site while signed in as a member → it opens. Sign in as someone who is not a member → **Members only**. Signed out → **Please sign in**.
4. Paste the app's address in a new tab → **Permission denied** with an **Open in SherigSpace** button.

## Messages
| Message | Meaning |
|---|---|
| Permission denied | Protected, and the app was opened directly or inside another website. The button brings the visitor to your site with that same app. |
| Please sign in | Protected, and the visitor is not signed in. After signing in, the site opens that app automatically. |
| Members only | Protected for paid members, and this visitor is not one. The box has a **See membership** button. |
| Setup not finished | Step 1 (the SQL) has not been run yet. |

## "Open in SherigSpace" and signing in
The Permission denied page has an **Open in SherigSpace** button that carries the app's address. Signed in → the site opens that app. Not signed in → after signing in, the site opens it automatically (remembered for 10 minutes).

## If something goes wrong
- **Blank white page in the viewer or the app:** the lock script did not load. Open `https://sherigspace.com/sherig-app-guard.js`: you should see code starting with "SherigSpace APP GUARD". A 404 means the file is not uploaded, or your site is offline (a private repository on a free GitHub plan unpublishes GitHub Pages). The three-line snippet above shows "Cannot verify access" after 5 seconds instead of a blank page.
- **Console says "Mixed Content":** the saved link starts with `http://`. The viewer now upgrades it to `https://` by itself, but the app must also work over https: in the app's repository go to **Settings → Pages** and tick **Enforce HTTPS** (it can take up to a day after DNS is set).
- **Falls back to protected if the settings cannot be read** (for example the SQL was not run, or the database is unreachable). This is on purpose, so nothing leaks.
- Press F12 → **Console** and send me the red lines if you are stuck.

## What this stops, and what it cannot
**Stops:** pasted or shared links, bookmarks, signed-out visitors, non-members (when you choose paid members), other websites embedding your app.
**Cannot stop:** a technically skilled person can still run their own copy if the app's GitHub repository is **public**, because anyone can download the files. The check runs in the browser: it keeps honest visitors out, but it is not a vault. Also, the rule applies to **all** your hosted apps together; it cannot yet make one app free and another paid.
Firefox, or a privacy extension that hides the "referrer", can cause a false "Permission denied". Chrome, Edge and Safari are not affected.

## The stronger option, if you ever need it
Real protection means the app files are never handed out without a server-side check: the files live in a private place, and a small server (for example a Cloudflare Worker) serves them only to allowed SherigSpace members. That is the only way to protect an app you cannot edit, and it can also make one app free and another paid. Tell me where your domain's DNS is managed (Cloudflare, GoDaddy, Namecheap…) and I'll plan it with you.
