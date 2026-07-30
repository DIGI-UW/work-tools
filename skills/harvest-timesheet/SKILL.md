---
name: harvest-timesheet
description: >
  Fill, reconcile, or correct a weekly Harvest timesheet from the Outlook calendar. Pulls the week's
  meetings, maps them to the user's approved projects, allocates the remaining hours as filler, and
  creates/updates entries via the Harvest MCP. Applies an Out-of-Office rule for public holidays and
  answers "did my timesheet get filled this week?" Triggers: "fill my timesheet", "harvest entries",
  "log my hours", "timesheet for this week", "mark a day OOO". Runs unattended on a weekly schedule
  or interactively. All personal data (identity, project IDs, mappings, filler split) lives in
  references/my-config.md — this playbook is generic.
---

# Harvest Timesheet Automation

Fills a Harvest timesheet for a target work week from the Outlook calendar, mapping meetings to the
user's approved projects and allocating the rest as filler. Only fills days that have **no existing
entries**, so it is safe to re-run.

## Step 0 — Load the user config (required)

Read **`references/my-config.md`** first. It holds everything personal/org-specific: identity,
timezone, approved projects (ids + keywords), mapping rules, filler split, hours/day, and holiday
jurisdiction. If `my-config.md` is missing, copy `references/my-config.example.md` to
`references/my-config.md` and help the user fill it in (see "Onboarding a new user" below) — do not
proceed with placeholder values.

Throughout this playbook, values in `{{braces}}` come from that config.

## Primary input method: the Harvest MCP connector

**Use the Harvest MCP for all reads and writes** — it handles auth, enforces entry ownership
server-side, and needs no token in the repo or browser. Key tools: `list_time_entries`
(`from`, `to`, optional `user_id`), `log_time` (`project_id`, `task_id`, `hours`, `spent_at`,
`notes`), `update_time_entry` (`id` + fields), `delete_time_entry` (`id`), `list_projects` /
`list_tasks` (discover ids), `get_account_settings` (rounding, week start, approval rules). See
`references/harvest-api.md` for the full tool reference and the Chrome-console fallback.

## Allocation rules
1. **{{hours_per_day}}** per regular workday (default 7.5h); **{{ooo_hours}}** for Out of Office /
   holidays (default 8h).
2. All hours in **0.25h (15-minute)** increments.
3. Skip weekends.
4. Filler split per `{{filler_split}}` in config. Any project marked "meeting hours only" gets no
   filler. In an interactive run, confirm the split before creating entries; in an unattended run,
   use the config default and note it.

## Public-holiday → Out of Office

Any legal holiday (for the jurisdiction named in config; default Washington State, RCW 1.16.050)
that falls on a business day is logged as a full **{{ooo_hours}}** Out-of-Office day (the OOO
project/task from config, note = holiday name). Do **not** map meetings on a holiday — the whole day
is OOO even if stray invites exist. `references/wa-holidays.js` implements the WA set with
observed-day shifting (fixed-date holiday on Saturday → observed the preceding Friday; on Sunday →
the following Monday). Swap in a different jurisdiction's list if config says so.

## Workflow

### Step 1 — Date range & existing entries
Compute the business days (Mon–Fri) of the target week. Pull existing entries with
`list_time_entries` (`from`/`to`) and total `hours` per `spent_at`. Days that already have entries
are **left alone** (unless explicitly correcting one — see Step 6).

### Step 2 — Classify each business day
For each business day with **no** existing entries:
- **Public holiday?** → `{{ooo_hours}}` Out of Office. Done; skip calendar mapping for that day.
- Otherwise → regular `{{hours_per_day}}` day; continue to Step 3.

### Step 3 — Read the Outlook calendar

Source-agnostic and detected at runtime. If an Outlook calendar **API tool is available**, prefer
it; otherwise use Chrome. Pick whichever is present; never fail or force an install.

**Option A — the `work-tools` `outlook_list_events` MCP, if connected** (optional). Detect at
runtime whether `outlook_list_events` exists (e.g. ToolSearch "outlook calendar events"); if so:
call it with `start_date` / `end_date` = the target range. It returns one object per event with
`subject`, `start` / `end`, `organizer`, `location`, `allDay`; pass `include_cancelled: true` only
if needed. Times come back in the host timezone (`{{timezone}}`), matching the Harvest account — use
`HH:MM` as-is, no UTC conversion. On an expired-token error call `outlook_refresh` once, then fall
back to Option B. Ignore any Google Calendar tool (personal events only). Setup:
`references/work-tools-setup.md`. The tool only appears in sessions started after the server is
registered.

**Option B — Chrome scraping (default, always works).** Navigate to
`https://outlook.office.com/calendar/view/week`, page to the target week, read each day with
`get_page_text`. If plain text lacks per-event times, pull event `aria-label`s via `javascript_tool`
— each carries "name, start to end, day, date, organizer, busy/free/tentative, canceled". Sanitize
labels (strip embedded URLs/query strings) and capture only name + time + weekday + date to avoid the
cookie/query-string content blocker.

Either option yields the same per-event fields (name, start/end, organizer, canceled) for Step 4.

### Step 4 — Map events to projects
Apply the approved-projects keyword table and the mapping rules from config. Skip canceled events and
anything on the config skip-list. Apply special routing rules from config (e.g. re-routing one
project's hours to another). If an event doesn't clearly map to an approved project: in an
interactive session, ask the user; in an unattended run, leave it out of meeting mapping (filler
still covers the day) and **note it in the report** rather than guessing.

### Step 5 — Allocate
Per non-holiday day: meeting hours per project + filler (`{{hours_per_day}}` − meeting hours) split
by the config percentages. Round to 0.25h and adjust so the day totals exactly `{{hours_per_day}}`.

### Step 6 — Create / correct entries
Create each entry with **`log_time`** (`project_id`, `task_id`, `hours`, `spent_at`, `notes` —
include meeting names). Keep one entry per project per day. To change a day that already has entries
(e.g. converting a workday to OOO), use **`update_time_entry`** (`id` from `list_time_entries` +
fields to change). Prefer updating over delete + re-create. The MCP enforces ownership.

### Step 7 — Verify & report
Re-pull the range with `list_time_entries`. Confirm each day totals exactly `{{hours_per_day}}` (or
`{{ooo_hours}}` OOO), all increments are 0.25h, and no skip-listed/never-bill project appears. Report
a per-day summary and list any skipped/ambiguous meetings. New entries are `unsubmitted` — submitting
is a separate manual step the user controls.

## Unattended-run behavior
On a schedule (no human present): execute autonomously, use the config filler default, apply the
holiday rule, **don't guess** ambiguous meetings (report them), and only take the write actions this
skill defines. When in doubt, produce a report.

## Success criteria
- All business days have entries; daily totals exactly `{{hours_per_day}}` (`{{ooo_hours}}` OOO); all
  0.25h increments.
- Public holidays logged as `{{ooo_hours}}` OOO.
- Only approved projects billed; never-bill projects never appear; no archived-project entries.
- Filler split confirmed (interactive) or defaulted-and-noted (unattended).
- No credentials committed to the repo.

## Onboarding a new user
1. `cp references/my-config.example.md references/my-config.md` (or a named `my-config.<you>.md`).
2. Fill in identity: run `get_account_settings` and `list_projects` / `list_tasks` via the Harvest
   MCP to discover the account id, your user id, project ids, and task ids.
3. List approved projects with calendar keywords; set the filler split; list skip/never-bill
   meetings and any special routing rules; set hours/day and holiday jurisdiction.
4. Claude can do all of this interactively — ask it to "set up my harvest-timesheet config".

## Reference files
| File | When to read |
|---|---|
| `references/my-config.md` | **Always first** — identity, projects, mappings, filler split, hours/day (gitignored; copy from the example) |
| `references/my-config.example.md` | Template to create `my-config.md` for a new user |
| `references/wa-holidays.js` | Compute whether a date is a WA State legal holiday (observed-day shifting) |
| `references/harvest-api.md` | Harvest MCP tool reference + legacy REST shapes for the Chrome fallback |
| `references/work-tools-setup.md` | Optional: install the `work-tools` MCP for the `outlook_list_events` calendar API (Step 3 Option A) |
