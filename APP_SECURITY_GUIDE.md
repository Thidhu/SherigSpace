# Apps & Games: protection, per-app rules, devices, usage (Admin)

## What is in Admin
**Settings → 🔒 Apps & games protection** (from before): Follow Free Mode / Always protect / Never protect, and who may open a protected app.

**🛡 Apps & Games** (new page, right above Settings):
- **Devices per membership:** how many devices one paid membership may use at the same time (0 = no limit), and how long a device counts as in use (minutes). Teachers, admins and students in a class are never limited.
- **Apps:** every app that has a rule or has been opened, with:
  - **Rule:** Follow the settings (Free Mode) / Free for everyone / Signed-in visitors only / Members only. Changing the dropdown saves it at once.
  - **Opens (30 days), People, Last opened.**
  - **👥 Who?** the signed-in people who opened it and how many signed-out visits there were.
  - **🧪 Test:** what a signed-out visitor, a signed-in non-member, a paid member and a teacher would get. It uses real accounts from your database and changes nothing.
- **Add rule:** type an app address (for example `lpgenerator.sherigspace.com`). `https://` and a final `/` are removed for you.
- **⚠️ Memberships on many devices:** members who used more devices than the limit in the last 7 days, with **Reset devices**.

## Setup (once, in this order)
1. **Supabase → SQL Editor** → run **`APP_CONTROL_SETUP.sql`** (safe to run again; it upgrades the earlier version).
2. Upload `admin-apps.js` next to `admin.html`, and add one line to `admin.html` near the end of `<body>`:
   `<script src="./admin-apps.js"></script>`
3. The other files stay as they are: `app-embed.js`, `sherig-app-guard.js`, `admin-app-control.js`. Re-upload `app-embed.js` and `sherig-app-guard.js` so the device and per-app features are on.

## How a visitor is decided
1. The app's address is looked up in the rules. A rule for that app wins; otherwise the global settings apply.
2. Free → opens for everyone. Protected → must be signed in, and must match "who may open".
3. Paid members on a device limit: each browser gets a random device id (kept in that browser). If the limit is full, a new device gets **Too many devices**. A device that has been idle longer than the window stops counting.
4. Each open is recorded: the app address, and the person (or "signed out"). Repeats within 20 seconds count once.
5. The decision and the device check happen in the database, so they cannot be bypassed from the browser.

## Limits, said plainly
- **Device counting is a limit, not a lock.** A device id is kept in the browser. Clearing the browser data, or using a private window, looks like a new device. It stops casual sharing of one membership; it does not stop a determined person.
- **Usage is recorded when an app is opened through the site.** A copied link opened directly is not recorded, because the app does not report back.
- **Checking that each app has the lock lines** needs access to your GitHub repositories, which this admin page does not have. Please check each app's `index.html` once: it must start with the three lock lines inside `<head>`.
- Rules apply to whole apps, not to pages or levels inside an app.

## If something does not show
- Message "Run APP_CONTROL_SETUP.sql…" → step 1 has not been run.
- The Apps page is missing → check step 2 and that the file is next to `admin.html`.
- F12 → Console, send me any red lines.
