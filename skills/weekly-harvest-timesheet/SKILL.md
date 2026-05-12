---
name: weekly-harvest-timesheet
description: |
  **Weekly Harvest Timesheet Generator**: Semi-supervised automation that gathers work signals from Outlook calendar, Jira, and GitHub, maps meetings to projects, fills remaining hours with project work, drafts a Harvest timesheet, and submits after user approval.
  - MANDATORY TRIGGERS: harvest, timesheet, time tracking, log hours, time entry, weekly hours, monthly hours, fill out harvest, submit timesheet, track my time, log my work, catch up on hours
  - Use this skill whenever the user wants to generate, review, or submit Harvest time entries based on their work activity.
  - Supports both weekly runs (typical Friday cadence) and monthly catch-up runs.
---

## Prerequisites

**MCP Servers** (register with `claude mcp add --scope user`):
- `work-tools` — Outlook calendar + Harvest time tracking (local, `mcp-servers/work-tools/`)
- GitHub MCP — PR tracking for project activity
- Atlassian MCP — Jira issue queries for project mapping

**Environment Variables**: None skill-specific. Harvest credentials are loaded by the `work-tools` MCP server from `.env.local` or `~/.work-tools.env`.

**Full tool reference:** See [references/work-tools-index.md](references/work-tools-index.md) for all available MCP tools, env vars, and other skills.

# Weekly Harvest Timesheet Generator

You are automating weekly Harvest time entry. Your job is to gather work signals, map actual calendar events to projects, fill remaining hours with project work, and submit only after explicit approval.

**User configuration**: See [references/my-config.md](references/my-config.md) for identity, project IDs, meeting mappings, and forecast data.

## Philosophy

This is a **rough approximation**, not rigorous time tracking. Every working day totals exactly 8 hours in whole-hour blocks. The workflow is:

1. Pull the Outlook calendar for the period
2. Categorize each meeting into a project (or mark as not attended / ignored)
3. Place meeting hours on their actual calendar days
4. Fill remaining hours each day with project work to reach 8h, guided by forecast targets
5. Present for review, adjust, submit

**Key principles:**
- Map ACTUAL work to projects — don't just proportionally allocate from the forecast
- The forecast is a guide for filling non-meeting hours, not a rigid formula
- DIGI General is a catch-all — it's never forecasted but always has actuals from meetings
- It's easier for the user to move hours between projects than to figure out what's missing

## Step 0: Load and Validate the FY26 Forecast (Budget Guide)

Try to locate the forecast spreadsheet in this order:
1. **Working directory**: Look for a file like `FY26 Team Time Forecast.xlsx` in the current working directory or workspace folder
2. **Ask the user**: "I couldn't find the forecast spreadsheet in the working directory. Can you drop the file here, share a link, or should I use the embedded table from last sync?"
3. **Fallback**: If neither finds it, use the embedded table below (check `forecast_last_synced` date for freshness)

If the spreadsheet is found from any source, read it to refresh the embedded table below.

### 0a. Check if the forecast is current

Compare the forecast data against the `forecast_last_synced` date in [references/my-config.md](references/my-config.md#fy26-forecast-hoursmonth) to decide whether the embedded table needs refreshing.

If the spreadsheet is newer than the sync date, re-read it and update the config. If the current month is beyond the last column in the forecast table, it's stale — ask the user:

> "The forecast only covers through [last month]. Do you have an updated forecast file, or should I use last month's project mix as a baseline?"

Also ask if the user knows of any forecast changes that haven't made it into the spreadsheet yet (projects added/removed, hours shifted between projects). This is common — the forecast in the spreadsheet may lag behind reality by weeks.

### 0b. Current forecast table

See [references/my-config.md](references/my-config.md#fy26-forecast-hoursmonth) for the monthly forecast by project. Use as a GUIDE for project work allocation, not as rigid targets.

**Important:** DIGI General is never forecasted — it absorbs internal meetings, admin, and coordination. It will always have actual hours. The forecasted total won't reach 160h; the gap is implicitly DIGI General.

### 0c. When forecast numbers seem off

The embedded table may have stale or incorrect numbers. If the forecast-guided allocation produces results that feel wrong (e.g., a project with 0h forecast but known active work), flag it and ask the user to confirm the correct target before proceeding. Trust the user's verbal corrections over the spreadsheet.

## Step 1: Determine the Date Range and Mode

If the user specifies a date range, use it. Otherwise, calculate Mon-Fri for the most recent completed work week.

**Detect mode:**
- **Weekly** (≤5 business days): process as a single week
- **Monthly** (>5 business days): break into Mon-Fri weeks, process sequentially

Print the date range and mode. For monthly mode, list the weeks.

## Step 2: Gather Work Signals

### 2a. Check Existing Harvest Entries
Always check first to avoid duplicates:
- `harvest_list_time_entries` with from/to date filters
- If entries exist for the range, show them and ask if we're replacing or filling gaps

### 2b. Pull Outlook Calendar (PRIMARY signal source)
Use `outlook_list_events` with start_date/end_date for the range. This is the **most important signal** — it tells us what meetings happened on which days.

**Note:** Google Calendar (`gcal_list_events`) only has personal events for this user. Do NOT use it for work meetings. Use Outlook exclusively for work calendar data.

If the Outlook token is expired, try `outlook_refresh` first. If the MCP server is unavailable,
use the daily-planner's bundled script as a fallback:
```bash
python3 "${CLAUDE_SKILL_DIR}/../daily-planner/scripts/outlook_client.py" list-events --start YYYY-MM-DD --end YYYY-MM-DD
```
The script shares the same token file and Chrome profile as the MCP server.

### 2c. Pull Jira Activity (secondary signal)
Use `searchJiraIssuesUsingJql` with the Cloud ID and project mappings from [references/my-config.md](references/my-config.md#jira):
- `assignee = currentUser() AND updated >= "YYYY-MM-DD" AND updated <= "YYYY-MM-DD" ORDER BY updated DESC`

### 2d. Pull GitHub Activity (secondary signal)
Use the GitHub MCP tools (requires GitHub MCP server to be configured):
- `list_pull_requests` — PRs created/reviewed/merged
- `search_issues` — issues worked on
- Repo-to-project mapping: OpenELIS repos → GOLD STAR OE AI, etc.

## Step 3: Categorize Calendar Events

This is the core step. Convert each Outlook event into a project assignment.

### 3a. Known Meeting → Project Mapping

Apply the meeting-to-project rules from [references/my-config.md](references/my-config.md#meeting--project-mappings) automatically.

### 3b. Meetings NOT Attended (ignore these)

See [references/my-config.md](references/my-config.md#meetings-not-attended-ignore-these) for the list of meetings the user is invited to but doesn't attend.

### 3c. Events to Ignore

See [references/my-config.md](references/my-config.md#events-to-ignore) for calendar events that aren't work meetings.

### 3d. QA: Present Unrecognized Meetings

For any meeting NOT in the known mapping above, present them in a clean table for the user to categorize:

```
These meetings weren't auto-categorized. Which project should they go to?

| # | Date | Meeting | Duration | Suggested |
|---|------|---------|----------|-----------|
| 1 | Feb 5 | New Partner Kickoff | 1h | ??? |
```

Do NOT ask the user open-ended questions — present options and let them respond concisely.

## Step 4: Build Day-by-Day Allocation

For each working day, build **two parallel lists** so meeting time-of-day is preserved all the way to Harvest:

**(a) Meeting entries** — one per attended calendar event:
- Carry the real `start_time` and `end_time` from the Outlook event (preserved as HH:MM 24-hour)
- Carry the mapped `project_id` / `task_id`
- Notes = the actual meeting title (e.g., "Madagascar Meetup")
- Hours = the meeting's true duration (may be fractional, e.g., 0.5 for a 30-minute standup)
- **Do not round up individual meetings** — sub-hour meetings stay sub-hour. Rounding happens at the project-fill level (below).

**(b) Project-fill entries** — one per (project, day) gap to reach 8h:
- Hours = `8 − sum(meeting hours that day) − pto/ooo hours`, distributed across projects based on:
  - Forecast ratios (Madagascar and Gold Star typically dominate)
  - Jira/GitHub signals for the day
  - Aim for 2-3 fill-projects per day, one dominant (4-6h)
- **Rounding lives here**: round each fill block to whole hours; the fill total absorbs any rounding from the meeting times so the day still totals exactly 8h.
- Place fill blocks in unoccupied parts of the 7:00am–4:00pm work day. Prefer a contiguous afternoon block (12:00–16:00) for the dominant fill project; smaller fill blocks fill gaps between morning meetings or before the first meeting. When multiple projects have fill, tile them sequentially with no overlap.

**OOO days**: skip both lists; emit a single 8h Out-of-Office entry instead.

### Time Block Rules
- Default work hours: 7am–4pm PST
- Project-fill blocks land between 07:00 and 16:00 (4pm) wherever the calendar is empty; the dominant project's fill prefers the 12:00–16:00 afternoon block. Tile sequentially when multiple projects have fill that day, with no overlap.
- **Meetings outside work hours still count** — some recurring meetings (e.g., Madagascar Meetup at 6am PST, Mekom at 7:30am) are scheduled early due to timezone differences. Their entries keep their actual early-morning start_time/ended_time.
- If two source events overlap on the calendar (e.g., a 30-min meeting nested inside a 1h block), present them to the user in Step 5 and ask which one was actually attended — only emit an entry for that one.

## Step 5: Present the Draft

Display two views — the per-day aggregate (for the eyeball check) **and** the time-of-day placement (so the user can spot wrong meeting categorizations before submission).

**Aggregate view (project hours per day):**
```
Date         Day  Mad  GS  Haiti  DG  WHO  Eth  OOO  Tot
----------------------------------------------------------
2026-02-02   Mon    4   2    1    1                    8
2026-02-03   Tue    3   2    1    2                    8
...
----------------------------------------------------------
TOTAL              47  31   10   29    2    1   40   160
```

**Time-of-day view (per-meeting + fill blocks, one block of lines per day):**
```
Mon 2026-02-02
  09:00–10:00  Mad    Madagascar review                  (1.0h)
  10:00–11:00  Mad    OpenELIS Dev                       (1.0h)
  11:00–12:00  DG     DIGI Team                          (1.0h)
  07:00–08:00  Haiti  project fill                       (1.0h, early gap)
  12:00–14:00  Mad    project fill                       (2.0h)
  14:00–16:00  GS     project fill                       (2.0h)

Tue 2026-02-03
  06:00–06:30  Mad    Madagascar Meetup                  (0.5h)
  09:00–10:00  Haiti  CHARESS                            (1.0h)
  10:00–11:00  DG     I-TECH                             (1.0h)
  11:00–12:00  DG     Ian & Piotr 1:1                    (1.0h)
  12:00–14:30  Mad    project fill                       (2.5h)
  14:30–16:00  GS     project fill                       (1.5h)
...
```

**Forecast comparison:**
```
- Madagascar: 47h actual vs 62h forecast — under (offset by DIGI General meetings)
- Gold Star: 31h actual vs 60h forecast — under (new project, ramping up)
- Haiti: 10h actual vs 20h forecast — under
- DIGI General: 29h actual vs ~0h forecast — expected (meeting catch-all)
```

Then ask: **"Does this look right? You can adjust specific days/projects/times, or approve to submit."**

## Step 6: Handle Adjustments

The user may say things like:
- "Move 2h from Madagascar to Gold Star on Monday"
- "Wednesday I was actually on PTO"
- "Reduce Haiti to 10h and add to Madagascar"
- "All DIGI General meetings look right"

Apply changes, re-verify all days = 8h, re-display affected rows.

## Step 7: Submit to Harvest

Create entries using `harvest_create_time_entry`. Always pass `started_time` + `ended_time` (HH:MM 24-hour) so each entry lands at its real time-of-day in Harvest — never rely on the 8am-synthesis fallback.

**For meeting entries:** pass the calendar event's actual start/end times.
```
harvest_create_time_entry(
  project_id = <mapped>,
  task_id    = <mapped>,
  spent_date = "2026-02-02",
  started_time = "09:00",
  ended_time   = "10:00",
  notes      = "Madagascar review",
)
```

**For project-fill entries:** pass the 12pm–4pm placement times computed in Step 4 (tiled when multiple projects have fill that day).
```
harvest_create_time_entry(
  project_id = <Madagascar>,
  task_id    = <task>,
  spent_date = "2026-02-02",
  started_time = "12:00",
  ended_time   = "14:00",
  notes      = "Project work — Madagascar",
)
```

**For Out-of-Office days:** a single 08:00–16:00 entry to the OOO project.

Do NOT pass `hours` when `started_time` + `ended_time` are both provided — Harvest computes hours from the duration, and passing both can produce ambiguous behavior. Hours-only entries silently no-op on Member-role accounts.

After all entries are created, verify with `harvest_list_time_entries` for the date range and confirm both totals and time-of-day placement match the approved draft.

Report: "Created [N] entries totaling [X] hours for [date range], placed at their actual times. Review and submit at https://app.harvestapp.com/time"

## Step 8: Validation

After submission, run these checks:
1. **Daily totals**: Every working day = exactly 8h
2. **Weekly totals**: Every working week = exactly 40h (or proportional if partial week)
3. **Project totals**: Compare actuals to approved draft — should match exactly
4. **No time overlaps**: No two entries on the same day with overlapping `started_time`/`ended_time`. Multiple entries per project per day are expected now (one per meeting + a fill block), but their time intervals must be disjoint.
5. **All entries have times**: Every entry has both `started_time` and `ended_time` set — if any landed at 8:00am-synthesized times, that's a regression and should be re-submitted.
6. **No orphans**: No days with 0h in the working period
7. **Task IDs valid**: All entries use correct task IDs per project

If any check fails, report the discrepancy and ask the user how to fix it.

## Step 9: Update Handoff Doc

After a successful run, update `harvest-timesheet-session-handoff.md` with:
- Date of last successful run
- Actual hours by project
- Forecast variances
- Any new meetings that needed manual categorization (add them to the mapping)

## Harvest Project → Task ID Reference

See [references/my-config.md](references/my-config.md#harvest-project--task-id-reference) for all project IDs, task IDs, and billability flags.

## Configuration

All personal configuration (identity, schedule, work hours, Jira cloud ID, Slack workspace) is in [references/my-config.md](references/my-config.md#identity).

Workflow configuration (not personalized):
- **Primary calendar source**: Outlook (`outlook_list_events`) — NOT Google Calendar
- **FY26 forecast reference**: Check working directory → Google Drive → ask user → fall back to config table
- **Automation level**: semi-supervised — always present draft and wait for approval
- **Rounding**: project-fill blocks round to whole hours; individual meeting entries keep their real durations (may be fractional). Project-fill absorbs any rounding so each day totals exactly 8h.
- **Daily total**: exactly 8h
- **Time-of-day**: every Harvest entry is submitted with explicit `started_time`/`ended_time` — meetings at their real calendar times, project-fill in the 12pm–4pm window
