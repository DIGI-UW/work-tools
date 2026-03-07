# Apps Script — Architecture & API Reference

## Overview

The Apps Script web app is the **single gateway** to the spreadsheet. It serves the dashboard
AND acts as the API layer for the skill. No service account or gspread needed — Apps Script
has native read/write permissions on its bound spreadsheet.

## Architecture

```
┌─────────────────────┐                     ┌──────────────────┐
│  Daily Planner Skill │    HTTP POST/GET    │  Apps Script      │     native     ┌──────────────┐
│  (Cowork / 5am cron) │ ──────────────────▶ │  Web App          │ ──────────────▶ │ Google Sheet  │
│  sheets_helper.py    │                     │  Code.gs          │                │ 6 tabs        │
└─────────────────────┘                     │                   │                └──────────────┘
                                            │  doGet → reads    │
┌─────────────────────┐                     │  doPost → writes  │
│  Browser (bookmark)  │ ──────────────────▶ │  → Dashboard.html │
└─────────────────────┘                     └──────────────────┘
```

## Authentication

All API calls (GET reads and POST writes) require a shared secret token:
- **GET**: `?page=<name>&token=YOUR_TOKEN`
- **POST**: `{"token": "YOUR_TOKEN", "action": "...", ...}`

The token must match the `planner_token` value in the Config tab. Two exceptions:
- **Dashboard HTML** (`?page=dashboard` or bare URL) — served without auth
- **`init` action** — exempt, since it creates the Config tab that holds the token

## API Endpoints

### GET Endpoints

All reads go through `?page=<name>&token=TOKEN`:

| Page | Returns |
|------|---------|
| `dashboard` (default) | HTML dashboard |
| `api` | Full dashboard JSON |
| `today` | Today tab as `{ok, tasks: [...]}` |
| `config` | Config tab as `{ok, config: {key: value}}` |
| `recurring` | Recurring tab as `{ok, tasks: [...]}` |
| `velocity` | Velocity tab as `{ok, entries: [...]}` |
| `history` | Recent history as `{ok, tasks: [...], dates: [...], days_queried}`. Optional `&days=N` param (default 7) |
| `status` | Tab row counts + spreadsheet info |

### POST Endpoints

All writes go through POST with `{token: "...", action: "...", ...}`:

| Action | Payload | Returns |
|--------|---------|---------|
| `init` | — | `{ok, created: [...], spreadsheet_url, spreadsheet_id}` |
| `save_today` | `{tasks: [...]}` | `{ok, count}` |
| `write_plan_json` | `{data: {...}}` | `{ok}` |
| `update_status` | `{task_title, status}` | `{ok, row}` |
| `archive_day` | `{date, tasks: [...]}` | `{ok, count}` |
| `log_velocity` | `{data: {...}}` | `{ok, row}` |
| `update_recurring` | `{task_name, updates: {...}}` | `{ok, row}` |
| `set_config` | `{key, value}` | `{ok}` |

### Task Dict Format (for save_today, archive_day)

```json
{
  "task": "Task title",
  "priority": 8,
  "est_hours": 1.5,
  "type": "hands-on",
  "stream": "A",
  "time_block": "9:00-10:30",
  "source": "jira",
  "source_link": "https://...",
  "status": "planned",
  "notes": "Context",
  "actual_hours": ""
}
```

## Data Flow

### Skill → Sheet (via HTTP POST)
The skill calls `sheets.write_plan_json(plan_data)` which POSTs to the web app.
The web app writes the JSON to PlanJSON A1 and timestamp to B1.

### Sheet → Dashboard (doGet)
When you visit the URL, `doGet()`:
1. Checks `current_plan_date` in Config tab (primary) and PlanJSON B1 timestamp (fallback)
2. If plan is for today: parses PlanJSON and renders
3. If stale: falls back to reading Today tab row-by-row

### Dashboard → Sheet (client-side)
"Mark Done" calls `google.script.run.updateTaskStatus()` which updates the Status column directly.

## Troubleshooting

**Dashboard shows "No plan yet"**: PlanJSON tab is empty. Run the skill.

**"Mark Done" doesn't work**: Verify Today tab has "Status" header and task title matches.

**Changes don't appear after re-deploy**: Apps Script caches. Try incognito or wait a few minutes.

**"Authorization required"**: Open Apps Script editor, run any function, approve permissions.
