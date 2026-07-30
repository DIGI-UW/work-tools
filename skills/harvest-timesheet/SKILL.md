---
name: harvest-timesheet
description: >
  Automate Casey's weekly Harvest timesheet for DIGI/I-TECH work. Use this skill whenever the
  task is to fill, reconcile, or correct Harvest time entries for a work week — pulling meetings
  from the Outlook calendar, mapping them to approved DIGI projects, allocating filler time, and
  creating or updating entries via the Harvest API. Also use it to apply the Out-of-Office rule for
  Washington State public holidays, or to answer "did my timesheet get filled this week?" Triggers:
  "fill my timesheet", "harvest entries", "log my hours", "timesheet for this week", "mark a day OOO".
  Designed to run unattended on a weekly schedule, but also works interactively.
---

# Harvest Timesheet Automation

Fills Casey's Harvest timesheet for the current work week (Mon–Fri) from the Outlook calendar,
mapping meetings to approved DIGI projects and allocating the rest as filler. Only fills days that
have **no existing entries**, so it is safe to re-run.

## Identity & environment

| Item | Value |
|---|---|
| Harvest Account ID | `978800` |
| Harvest User ID | `2344962` |
| Email | `caseyi@uw.edu` |

> **Account conventions** (from `get_account_settings`, confirmed 2026-06-20): approval is
> required before timesheets are final, hour **rounding is OFF** (log exact 0.25h values),
> timers want clock-in/out timestamps, and the Harvest week starts Sunday — but Casey's work week
> is **Mon–Fri**, so always drive the range explicitly, don't rely on the account's week start.

### Primary input method: the Harvest MCP connector

**Use the Harvest MCP for all reads and writes** — it handles auth, enforces entry ownership
server-side, and needs no token in the repo or browser. Key tools:

| Action | MCP tool |
|---|---|
| Check what's already logged | `list_time_entries` (`from`, `to`, optional `user_id`) |
| Create an entry | `log_time` (`project_id`, `task_id`, `hours`, `spent_at`, `notes`) |
| Correct an entry | `update_time_entry` (`id`, + fields to change) |
| Remove an entry | `delete_time_entry` (`id`) |
| Discover project / task ids | `list_projects`, `list_tasks` |
| Account rules | `get_account_settings` |

> **Fallback only:** if the MCP is unavailable, the legacy path is the **Chrome console**
> (`javascript_tool`) after navigating to `https://digitc.harvestapp.com` — the network proxy
> blocks direct `curl`/Python, so don't attempt those. Any token used in the fallback is supplied
> at runtime, **never committed** (`openelis-work` is public). If you find a token hardcoded in a
> task file, treat it as compromised and rotate it in Harvest (Settings → Developers).

## Approved projects (bill ONLY to these)

| Project | Project ID | Task ID | Calendar keywords |
|---|---|---|---|
| Madagascar LIS (FY26) | 46605259 | 23300925 | Madagascar, Mekom, eSIL/e-SIL, MedX, O3 Squad, OpenMRS, Comité de projet, OpenELIS Review, OpenELIS Community Call, **TAP/DRC → bill to Madagascar** |
| Indonesia LIS (FY26) | 47227048 | 23300925 | Indonesia, APHL, SILNAS, Indo, OE cross-project coordination |
| Papua New Guinea LIS Tranche 2 (FY26/FY27) | 48537882 | 23300925 | PNG, Papua, Johnson, Dev/tech team weekly check-in |
| DIGI General Work | 18982046 | 23300925 | DIGI, DGH, OHIE, Zim VMMC, Workforce, TPM, Interoperability, OMRS Checkin, Team Meeting, Dev Weekly strategy review |
| Ethiopia LIS AHRI (FY26) | 46004172 | 23300925 | Ethiopia, Orbit |
| Out of Office | 18507028 | 19814923 | OOO, holiday, vacation, sick, **WA public holiday** |

> **PNG project rollover (2026-07-10):** PNG Tranche 1 (`46605414`) was **archived 2026-06-18** —
> Harvest rejects entries against it. Bill PNG to Tranche 2 (`48537882`). If any project id 404s or
> reports "isn't active", re-discover via `list_projects` and match by name (see Improvements).

### Critical mapping rules
- **NEVER bill TAP/DRC.** Bill those hours to **Madagascar** instead.
- **OpenELIS Community Call → Madagascar.** **OE cross-project coordination → Indonesia.**
- **Skip (do not bill):** Open Digital Health Summit Planning Call, OHS Developers Calls, Global
  Product Support Team, Yao Celebration Potluck, "RE: Fortnightly Catch Up", Aurum & DIGI follow-up,
  any private "Busy" blocks. **Canceled events → skip entirely.**
- **If an event doesn't clearly map to one of the 6 projects:** in an interactive session, ask
  Casey; in an **unattended/scheduled** run, leave it out of the meeting mapping (it still gets
  covered by filler) and **note it in the report** rather than guessing.

## Allocation rules
1. **7.5 h** per regular workday; **8.0 h** for Out of Office / holidays.
2. All hours in **0.25 h (15-minute)** increments.
3. Skip weekends.
4. Default filler split: **80% Papua New Guinea / 20% Indonesia** (updated 2026-07-10; replaces the
   30% Madagascar / 70% Indonesia split of 2026-05-29). Madagascar now gets **meeting hours only**,
   no filler. In an interactive run, confirm with Casey before creating entries; in an unattended
   run, use this default and note it.

## Washington State public holidays → 8 h Out of Office

Any Washington State legal holiday (RCW 1.16.050) that falls on a Mon–Fri is logged as a **full
8.0 h Out of Office** day (project `18507028`, task `19814923`, note = holiday name). Do **not** map
calendar meetings on a holiday — the whole day is OOO even if stray invites exist. Observation:
when a fixed-date holiday falls on a Saturday it is observed the preceding Friday; on a Sunday, the
following Monday (standard WA practice for state workers).

| Holiday | Date rule |
|---|---|
| New Year's Day | January 1 |
| Martin Luther King Jr. Day | 3rd Monday in January |
| Presidents' Day | 3rd Monday in February |
| Memorial Day | last Monday in May |
| **Juneteenth** | **June 19** |
| Independence Day | July 4 |
| Labor Day | 1st Monday in September |
| Veterans Day | November 11 |
| Thanksgiving Day | 4th Thursday in November |
| Native American Heritage Day | Friday after Thanksgiving |
| Christmas Day | December 25 |

A ready-to-run holiday check (`isWaHoliday(date)`) lives in `references/wa-holidays.js`.

## Workflow

### Step 1 — Date range & existing entries
Compute Mon–Fri of the target week. Pull existing entries with `list_time_entries` (`from`/`to` =
that Mon/Fri) and total `hours` per `spent_at`. Days that already have entries are **left alone**
(unless explicitly correcting one — see Step 6).

### Step 2 — Classify each business day
For each Mon–Fri with **no** existing entries:
- **WA public holiday?** → 8.0 h Out of Office. Done; skip calendar mapping for that day.
- Otherwise → regular 7.5 h day; continue to Step 3.

### Step 3 — Read the Outlook calendar

There is **no required calendar MCP** — this skill works with the browser out of the box. If an
Outlook calendar **API tool happens to be available** in the session, prefer it; otherwise use the
Chrome method. Pick whichever is present at runtime; do not fail or ask Casey to install anything.

**Option A — the `work-tools` `outlook_list_events` MCP, only if it's already connected** (optional
enhancement, verified 2026-07-30). Detect at runtime whether the `outlook_list_events` tool exists
(e.g. via ToolSearch for "outlook calendar events"); if it does:

- Call `outlook_list_events` with `start_date` / `end_date` = the target Mon–Fri range. It returns
  one object per event with `subject`, `start` / `end`, `organizer`, `location`, and `allDay`; pass
  `include_cancelled: true` only if you need canceled events (default omits them).
- Times come back in the host's local timezone (Pacific via `OUTLOOK_TIMEZONE`), which matches the
  Harvest account — use the `HH:MM` values as-is, **no UTC conversion**.
- If a call fails on an expired token, call `outlook_refresh` once and retry; if that fails, fall
  back to Option B.
- Ignore any Google Calendar tool — it only holds Casey's personal events, not the work calendar.

This path needs no live browser during the run, so it's the nicer option for **unattended/scheduled
runs** — but only when the tool is already there. **Never treat it as a prerequisite**; it's a local
MCP Casey opts into. Setup steps (clone/build/register + one-time SSO token capture) live in
`references/work-tools-setup.md`. Note the tool only appears in sessions started *after* the server
is registered.

**Option B — Chrome scraping (default, always works).** Navigate to
`https://outlook.office.com/calendar/view/week`, page to the target week, and read each day with
`get_page_text`. If plain text lacks per-event times, pull event `aria-label`s via `javascript_tool`
— each carries "name, start to end, day, date, organizer, busy/free/tentative, canceled". Sanitize
labels (strip embedded URLs/query strings) and capture only name + time + weekday + date to avoid the
cookie/query-string content blocker.

Either option yields the same per-event fields (name, start/end, organizer, canceled) that Step 4 consumes.

### Step 4 — Map events to projects
Apply the keyword table and critical rules. Skip canceled and skip-list meetings. TAP/DRC → Madagascar.

### Step 5 — Allocate
Per non-holiday day: meeting hours per project + filler (7.5 h − meeting hours) split by the
confirmed percentages. Round to 0.25 h and adjust so the day totals **exactly 7.5 h**.

### Step 6 — Create / correct entries
Create each entry with **`log_time`** (`project_id`, `task_id`, `hours`, `spent_at`, `notes` —
include meeting names). Conceptually entries run sequentially from 8:00 am (regular day = 7.5 h,
OOO = 8 h); `log_time` is hours-based, so clock times aren't required, but keep one entry per
project per day.

**Correcting a day that already has entries** (e.g. converting a workday to a holiday OOO): use
**`update_time_entry`** (`id` from `list_time_entries`, plus the fields to change — `project_id`,
`task_id`, `hours`, `notes`). Prefer updating over `delete_time_entry` + re-create. The MCP enforces
ownership, so you can only change Casey's own entries.

### Step 7 — Verify & report
Re-pull the range with `list_time_entries`. Confirm each day totals exactly **7.5 h** (or **8 h**
OOO), all increments are 0.25 h, and **no TAP** entries exist. Report a per-day summary. Note that
new entries are `unsubmitted` — submitting/approving the timesheet is a separate manual step Casey
controls (see Improvements).

## Unattended-run behavior
When run on a schedule (no human present): execute autonomously, use the documented filler default,
apply the WA holiday rule, **don't guess** ambiguous meetings (report them instead), and only take
write actions (`POST`/`PATCH`) that this skill defines. When in doubt, produce a report.

## Success criteria
- All business days have entries; daily totals exactly 7.5 h (8 h OOO); all 0.25 h increments.
- WA public holidays logged as 8 h OOO.
- No TAP entries, ever. No entries against archived projects (PNG Tranche 1 `46605414`).
- Filler split confirmed (interactive) or defaulted-and-noted (unattended).
- No credentials committed to the repo.

## Improvements / backlog
- **Discover IDs at runtime instead of hardcoding.** The project/task ids here are a convenience
  cache; confirm against `list_projects` / `list_tasks` so the skill survives an FY rollover
  (FY26 → FY27 projects). Match by name when an id 404s — this bit us 2026-07-10 when PNG Tranche 1
  was archived mid-quarter.
- **Submission is intentionally manual.** New entries land `unsubmitted`; `submit_timesheet` exists
  but the skill does not auto-submit, so Casey reviews before approval. Revisit only if Casey asks.
- **Project-list drift check.** Once a quarter, diff `list_projects` against the approved-projects
  table and flag added/renamed/archived projects.
- **Better filler signal.** The 80/20 PNG/Indonesia default reflects current priorities
  (2026-07-10); revisit when PNG Tranche 2 winds down (ends 2026-12-31) or at quarter start.
- **Holiday calendar coverage.** `wa-holidays.js` encodes WA state holidays only. If I-TECH/UW
  observes additional closure days (e.g. a winter break day), add them as a separate list.

## Reference files
| File | When to read |
|---|---|
| `references/wa-holidays.js` | Computing whether a date is a WA State legal holiday (with observed-day shifting) |
| `references/harvest-api.md` | MCP tool reference + legacy REST shapes for the Chrome fallback |
| `references/work-tools-setup.md` | Optional: install the `work-tools` MCP for the `outlook_list_events` calendar API (Step 3 Option A) |
