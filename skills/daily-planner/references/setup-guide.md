# Daily Planner — Setup Guide

Everything you need to go from zero to a working daily planner with a live dashboard.

**What you'll end up with:**
- A Google Sheet that tracks your plans, history, velocity, and recurring tasks
- A bookmarkable post-it dashboard that shows today's plan at a glance
- A scheduled 5am run that builds your plan before you wake up

**Time to set up:** ~10 minutes (one-time)

---

## Part 1: Pick Your Planner Folder

The skill needs a **home folder** on your computer where it stores its settings. This
folder persists between sessions — once set up, you never have to redo it.

1. Create a folder anywhere you like. Good options:
   - `~/Documents/daily-planner/`
   - `~/Desktop/daily-planner/`

2. When starting a Claude Desktop project or Cowork session for planning, **always select
   this folder** as the working directory. The skill looks here for its settings file.

> This folder is your planner's home base. All configuration lives here.

---

## Part 2: Install the Skill

1. In the Claude desktop app, open **Settings → Skills** (or drag-and-drop the `.skill` file)
2. Install `daily-planner.skill`
3. Verify it appears in your available skills list

Once installed, saying "plan my day" or "what should I focus on?" triggers it.

---

## Part 3: Create the Spreadsheet & Dashboard

### 3a. Create a blank spreadsheet

Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
Name it whatever you like (e.g., "Daily Planner").

### 3b. Open Apps Script

From your spreadsheet: **Extensions → Apps Script**

### 3c. Add Code.gs

1. Select all the default code in `Code.gs` and delete it
2. Open `scripts/appscript/Code.gs` from this skill's files
3. Copy-paste the entire contents into the editor

### 3d. Add Dashboard.html

1. Click the **+** next to "Files" → choose **HTML**
2. Name it exactly `Dashboard` (Apps Script adds `.html` automatically)
3. Delete the default HTML
4. Open `scripts/appscript/Dashboard.html` from this skill's files
5. Copy-paste the entire contents

### 3e. Save, Authorize, and Initialize

1. **Save** (Ctrl+S / Cmd+S)
2. Select `doGet` from the function dropdown (top toolbar) → click **Run**
3. A dialog says "Authorization required" → click **Review Permissions**
4. Choose your Google account
5. If you see "Google hasn't verified this app" → click **Advanced → Go to Daily Planner (unsafe)** → **Allow**

This grants the script access to your spreadsheet and automatically creates all 6 tabs
(Today, History, Recurring, Velocity, Config, PlanJSON) with headers and default settings.
Switch to your spreadsheet tab to confirm you see the new tabs.

### 3f. Deploy as Web App

1. Click **Deploy → New deployment** (top right)
2. Gear icon next to "Select type" → **Web app**
3. Fill in:
   - **Description**: `Daily Planner`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` (or `Anyone within [your org]`)
4. Click **Deploy**
5. **Copy the Web App URL** — you'll need this in Part 4

The URL looks like: `https://script.google.com/macros/s/AKfycb.../exec`

---

## Part 4: Set Up Credentials

The skill talks to your spreadsheet over HTTP. It needs two pieces of info:
the web app URL (where to send requests) and a password (to prove it's you).

### 4a. Generate a password

Ask Claude: "Generate a random 32-character password for me." Copy it.

Or make up a long random password yourself — anything 20+ characters works.

### 4b. Save the password in your spreadsheet

Go to your spreadsheet → **Config** tab → find the `planner_token` row → paste the
password into **column B**.

While you're there, also paste your Web App URL (from Part 3f) into the `dashboard_url` row.

### 4c. Create your settings file

Open your planner folder (from Part 1) and create a file called `.env` with these contents:

```
DAILY_PLANNER_URL=https://script.google.com/macros/s/YOUR_URL_HERE/exec
DAILY_PLANNER_TOKEN=YOUR_PASSWORD_HERE
```

Replace `YOUR_URL_HERE` with your actual Web App URL from Part 3f, and `YOUR_PASSWORD_HERE`
with the password you just saved in the Config tab.

**How to create the file:**
- Ask Claude: "Create a .env file in this folder with my planner credentials" and paste
  the URL and password when prompted
- Or open any text editor, paste the two lines above, and save as `.env` in your planner folder

> The `.env` file stores your credentials locally. It never leaves your computer.
> Make sure the values here match what's in your spreadsheet's Config tab.

---

## Part 5: Personalize Your Config

The skill has a config file that tells it who you are and what to include in your plans.

Open `references/my-config.md` (bundled with the skill) and fill in your details:

- **Identity**: Your name, email, work hours, daily capacity
- **Scope rules**: Which repos and calendars are work vs personal
- **Jira**: Your Jira Cloud ID (ask Claude to look it up for you)
- **Slack**: Your workspace name and user ID

See `references/my-config.example.md` for a template with all the fields explained.

---

## Part 6: Test It

1. Open Claude Desktop and start a session **in your planner folder**
2. Say: **"plan my day"**
3. The skill should:
   - Pull data from your connected services (Jira, Slack, GitHub, Outlook)
   - Build a prioritized, time-blocked plan
   - Save it to your spreadsheet (Today tab and PlanJSON tab)
4. Open your Web App URL in a browser — you should see a dashboard with your plan

> **Bookmark the dashboard URL** — it always shows your latest plan.

---

## Part 7: Schedule the Morning Run (Optional)

To have the planner auto-generate each morning before you start work:

Say this in Claude:

> "Create a scheduled task called daily-planner that runs at 5am Pacific every weekday.
> It should run the daily-planner skill to build my daily plan."

When you open your dashboard each morning, today's plan is already there.

**Managing the schedule:**
- **Pause**: "Pause the daily-planner scheduled task"
- **Change time**: "Update the daily-planner schedule to 6am"
- **Run now**: "Plan my day" (triggers on-demand anytime)

---

## Updating the Dashboard Later

If you get an updated version of `Dashboard.html` or `Code.gs`:

1. Open Apps Script (**Extensions → Apps Script** from the spreadsheet)
2. Paste the updated code
3. **Deploy → Manage deployments** → pencil icon → set Version to **New version** → **Deploy**

The URL stays the same — no need to update your settings.

---

## Troubleshooting

**"No plan yet" on dashboard**: The PlanJSON tab is empty. Run the skill first ("plan my day").

**Dashboard shows yesterday's data**: Re-run the skill to refresh.

**"Authorization required"**: Open Apps Script → run any function manually → approve permissions again.

**"Unauthorized" errors from the skill**: The password in your `.env` file doesn't match
the `planner_token` value in the Config tab. Open both and make sure they're identical.

**Credentials not found**: `sheets_helper.py` looks for a `.env` file in this priority order
(first hit wins):
1. The path in the `DAILY_PLANNER_ENV_FILE` env var, if set (power-user override)
2. `./.env` — the current working directory
3. `~/Documents/DailyPlanner/.env` — the default workspace location
4. `~/.daily-planner.env` — home-dir fallback (works from any cwd, including
   scheduled tasks and Cowork session sandboxes)

The script logs which path it loaded from to stderr (look for `[sheets_helper] loaded env from ...`).
If none of these resolves, set `DAILY_PLANNER_URL` and `DAILY_PLANNER_TOKEN` directly in your
shell — shell env always wins over file-loaded values.

**Tabs weren't created**: Check the Execution log in Apps Script for errors. Re-run `doGet`
and go through the authorization flow again.
