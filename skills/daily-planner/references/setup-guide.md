# Daily Planner — Setup Guide

Everything you need to go from zero to a working daily planner with a live dashboard.

**What you'll end up with:**
- A Google Sheet that tracks your plans, history, velocity, and recurring tasks
- A bookmarkable post-it dashboard that shows today's plan at a glance
- A scheduled 5am run that builds your plan before you wake up

**Time to set up:** ~5 minutes (one-time)

**No service account, no GCP project, no pip installs.** The skill talks to Apps Script
via HTTP, and Apps Script has native permissions on its own spreadsheet.

---

## Part 1: Install the Skill

1. In the Claude desktop app, open **Settings → Skills** (or drag-and-drop the `.skill` file)
2. Install `daily-planner.skill`
3. Verify it appears in your available skills list

Once installed, saying "plan my day" or "what should I focus on?" triggers it.

---

## Part 2: Create the Spreadsheet & Apps Script

### 2a. Create a blank spreadsheet

Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet. Name it whatever you like (e.g., "Daily Planner").

### 2b. Open Apps Script

From your spreadsheet: **Extensions → Apps Script**

### 2c. Add Code.gs

1. Select all the default code in `Code.gs` and delete it
2. Open `scripts/appscript/Code.gs` from this skill's files
3. Copy-paste the entire contents into the editor

### 2d. Add Dashboard.html

1. Click the **+** next to "Files" → choose **HTML**
2. Name it exactly `Dashboard` (Apps Script adds `.html` automatically)
3. Delete the default HTML
4. Open `scripts/appscript/Dashboard.html` from this skill's files
5. Copy-paste the entire contents

### 2e. Save, Authorize, and Initialize

1. **Save** (Ctrl+S / Cmd+S)
2. Select `doGet` from the function dropdown (top toolbar) → click **Run**
3. A dialog says "Authorization required" → click **Review Permissions**
4. Choose your Google account
5. If you see "Google hasn't verified this app" → click **Advanced → Go to Daily Planner (unsafe)** → **Allow**

This does two things in one step: grants the script access to your spreadsheet, and
automatically creates all 6 tabs (Today, History, Recurring, Velocity, Config, PlanJSON)
with headers, formatting, sample data, and default settings. Switch to your spreadsheet
tab to confirm you see the new tabs.

**Re-initializing later:** If you ever need to refresh headers, formatting, or pick up
new Config defaults after an update, select `initializeSheet` from the function dropdown
and click Run. It preserves your existing data and config values — only adds what's missing.

### 2f. Deploy as Web App

1. Click **Deploy → New deployment** (top right)
2. Gear icon (⚙️) next to "Select type" → **Web app**
3. Fill in:
   - **Description**: `Daily Planner`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` (or `Anyone within [your org]` for UW Workspace)
4. Click **Deploy**
5. **Copy the Web App URL** — this is your dashboard AND your API endpoint

It looks like: `https://script.google.com/macros/s/AKfycb.../exec`

---

## Part 3: Set Up the API Token

First, while you're in the spreadsheet, paste your Web App URL into the **Config** tab:
find the `dashboard_url` row → paste the URL from Part 2f into column B.

The skill talks to your spreadsheet over HTTP. Every API call is protected by a shared
secret — a password that the skill sends with each request. The dashboard page itself is
exempt, so you can bookmark it freely.

### 3a. Pick a token

You need a random string to use as your password. The easiest way:

1. Open **Terminal** (Spotlight → type "Terminal" → Enter)
2. Paste this and press Enter:
   ```
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
3. It prints a long random string like `xK7m_2bN9p...` — **copy it**

(Or just make up a long random password yourself — anything 20+ characters works.)

### 3b. Paste the token into your spreadsheet

Go to your spreadsheet → **Config** tab → find the `planner_token` row (near the bottom)
→ paste the token into **column B**.

### 3c. Tell Claude the URL and token

There are two ways to provide the credentials, depending on how you run the skill:

#### Option A: Shell environment variables (Claude Code / Terminal)

Open **Terminal** and paste these two lines (edit the values first):

```
echo 'export DAILY_PLANNER_URL="https://script.google.com/macros/s/YOUR_ID_HERE/exec"' >> ~/.zshrc
echo 'export DAILY_PLANNER_TOKEN="YOUR_TOKEN_HERE"' >> ~/.zshrc
```

Replace `YOUR_ID_HERE` with your actual Web App URL from Part 2f, and `YOUR_TOKEN_HERE`
with the token you just pasted into the Config tab.

Then reload your shell:

```
source ~/.zshrc
```

**What this does:** These two lines add environment variables to your shell config so
Claude can find them when the skill runs. `DAILY_PLANNER_URL` is the address of your
web app, and `DAILY_PLANNER_TOKEN` is the password that proves the request is from you.

> **Note:** This method works for Claude Code and terminal-based usage. For Cowork mode,
> use Option B below.

#### Option B: `.env` file (Cowork / sandboxed environments)

Cowork runs in an isolated Linux VM that does **not** inherit your macOS/Linux shell
environment (`~/.zshrc`, `~/.bashrc`, etc.). The VM's home directory and CWD also reset
between sessions. The skill supports a `.env` file fallback for this case.

**Recommended: Place `.env` in your mounted workspace folder.** When you select a folder
in Cowork (e.g., a "DailyPlanner" folder on your Mac), it gets mounted at `~/mnt/<FolderName>/`
inside the VM. This is the only location that persists between sessions.

1. On your Mac, create a `.env` file in the folder you'll select in Cowork:
```
# Daily Planner credentials
DAILY_PLANNER_URL="https://script.google.com/macros/s/YOUR_ID_HERE/exec"
DAILY_PLANNER_TOKEN="YOUR_TOKEN_HERE"
```

2. In Cowork, select that folder when prompted (or use "Select folder" in settings)
3. The skill automatically finds `.env` at `~/mnt/<FolderName>/.env`

**Alternative locations** (the skill searches in this order, first found wins):
1. Current working directory
2. Any mounted workspace folder (`~/mnt/*/`) — **this is the Cowork-recommended path**
3. Skill root directory (next to `scripts/`) — read-only in Cowork, so this only works
   if you bundled `.env` with the skill before installing
4. `~/.daily-planner.env` — resets between Cowork sessions, not recommended

**Security note:** The `.env` file should not be committed to version control. It is
included in the skill's `.gitignore` by default.

### 3d. Verify it works

Still in Terminal (or in the Cowork chat by asking Claude to test):

```
python3 -c "import os; print('URL:', 'set' if os.environ.get('DAILY_PLANNER_URL') else 'MISSING'); print('Token:', 'set' if os.environ.get('DAILY_PLANNER_TOKEN') else 'MISSING')"
```

You should see:
```
URL: set
Token: set
```

If either says MISSING, re-check that you ran `source ~/.zshrc` (Option A) or that
your `.env` file is in one of the expected locations (Option B).

---

## Part 4: Schedule the Morning Run

To have the planner auto-generate each morning before you start work.

### Ask Claude

Say this in Claude:

> "Create a scheduled task called daily-planner that runs at 5am Pacific every weekday. It should run the daily-planner skill to build my daily plan."

Claude will use the `schedule` skill to create a cron-based task (`0 5 * * 1-5`).

### What it does each morning

1. Queries Jira, Slack, GitHub, Outlook, and Harvest
2. Builds a prioritized, time-blocked plan with parallel work streams
3. Writes the plan to the Today tab and dashboard JSON to PlanJSON
4. Archives yesterday's plan to History and logs velocity metrics

When you open your dashboard URL, today's plan is already there.

### Managing the schedule

- **Pause**: "Pause the daily-planner scheduled task"
- **Change time**: "Update the daily-planner schedule to 6am"
- **Run now**: "Plan my day" (triggers on-demand)

---

## Part 5: Test Everything

1. **Run the skill**: Say "plan my day" in Claude
2. **Check the spreadsheet**: Today tab has tasks, PlanJSON has the JSON blob
3. **Open the dashboard**: Visit your Web App URL — post-it cards with your plan
4. **Try Mark Done**: Click a task → expand → "Mark Done" → card greys out with a checkmark

---

## Updating the Dashboard Later

If you modify `Dashboard.html` or `Code.gs`:

1. Open Apps Script (**Extensions → Apps Script** from the spreadsheet)
2. Paste the updated code
3. **Deploy → Manage deployments** → pencil icon → set Version to **New version** → **Deploy**

The URL stays the same — no need to update Config or the env var.

---

## How It Works (Architecture)

```
Claude (Cowork VM)              Apps Script Web App              Google Sheet
─────────────────              ────────────────────              ────────────

  sheets_helper.py  ──HTTP──▶  doPost() / doGet()  ──native──▶  6 tabs
  (urllib, no deps)             Code.gs                          (Today, History,
                                                                  Recurring, Velocity,
  Browser           ──HTTP──▶  doGet() → Dashboard.html          Config, PlanJSON)
  (bookmark)
```

The Apps Script web app is the only gateway to the spreadsheet. It handles reads (GET)
and writes (POST) natively — no service account, no OAuth dance, no pip dependencies.
All API calls require a shared secret token (stored in Config tab, sent via env var).
The dashboard HTML is served without auth for easy bookmarking.

---

## Troubleshooting

**"No plan yet" on dashboard**: PlanJSON tab is empty. Run the skill first ("plan my day").

**Dashboard shows stale data**: Timestamp in PlanJSON B1 doesn't match today. Re-run the skill.

**"Authorization required"**: Open Apps Script → run any function manually → approve permissions.

**Tabs weren't created after running doGet**: Check the Execution log for errors. If permissions weren't granted properly, re-run `doGet` and go through the authorization flow again.

**Mark Done doesn't persist after skill re-runs**: Expected — the skill regenerates from scratch. Tasks marked done in the Today tab are recognized and excluded/noted in the next run.

**Changes don't appear after re-deploy**: Apps Script caches. Try incognito or wait a few minutes.

**"Unauthorized" errors from the skill**: The token in your `DAILY_PLANNER_TOKEN` env var doesn't match the `planner_token` value in the Config tab. Open the Config tab, check column B for the `planner_token` row, and make sure it matches exactly.

---

## Future: OAuth with Google Identity

The shared secret token is simple and works well, but a future iteration could use proper
Google OAuth so the script authenticates with your own Google identity instead of a static token.
The approach:

1. Deploy the web app with **Who has access: Only myself**
2. Use `gcloud auth print-access-token` to get a short-lived OAuth bearer token
3. Send it as `Authorization: Bearer <token>` in HTTP requests
4. Apps Script validates the bearer token matches the deployer's Google account

This eliminates the shared secret and uses Google's own auth. It requires `gcloud` CLI
installed and authenticated (`gcloud auth login`). The web app access scope can then be
restricted to "Only myself" since the bearer token carries your Google identity.

Not yet implemented because gcloud isn't always available in the Cowork VM, but the
Code.gs and sheets_helper.py architecture supports swapping in bearer token auth later
without structural changes.
