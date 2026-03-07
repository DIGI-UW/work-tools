# Tracking Sheet Structure

The daily planner persists all state in a single workbook with 6 tabs.
This file defines the exact structure so the skill produces consistent, well-formatted output.

## Location & Initialization

The skill talks to the spreadsheet via the Apps Script web app (env var `DAILY_PLANNER_URL`).
The `initialize()` method creates all tabs, headers, formatting, and defaults from a blank
spreadsheet automatically. No service account needed — Apps Script has native permissions.
See `references/setup-guide.md` for full setup instructions.

---

## Tab 1: Today

The active daily plan. Cleared and repopulated each morning.

### Columns

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | # | Integer | Task order (1, 2, 3...) |
| B | Task | Text | Clear, actionable task title |
| C | Priority | Integer (1-10) | Priority score (10 = highest) |
| D | Est. Hours | Decimal | Estimated duration |
| E | Type | Text | `hands-on` or `delegatable` |
| F | Stream | Text | `A` (focus), `B` (AI-1), `C` (AI-2), `M` (meeting) |
| G | Time Block | Text | Suggested time range, e.g., "9:00-10:30" |
| H | Source | Text | Origin system: `jira`, `slack`, `github`, `outlook`, `harvest`, `recurring` |
| I | Source Link | URL | Direct link to the source item |
| J | Status | Text | `planned`, `in-progress`, `done`, `deferred`, `dropped` |
| K | Notes | Text | Context, flags, dependencies |
| L | Actual Hours | Decimal | Filled during/after work (for velocity tracking) |

### Formatting

- **Header row**: Bold, dark blue background (#1F3864), white text, frozen
- **Priority coloring**: Conditional formatting on column C
  - 8-10: Red fill (#FFCCCC) — must-do
  - 5-7: Yellow fill (#FFFFCC) — should-do
  - 1-4: Green fill (#CCFFCC) — if-time-allows
- **Stream coloring**: Light background tint on column F
  - A: Light blue (#DAEEF3)
  - B/C: Light purple (#E4DFEC)
  - M: Light gray (#F2F2F2)
- **Status styling**: Column J
  - `done`: Green text, strikethrough on task title
  - `deferred`: Orange text
  - `dropped`: Gray text, strikethrough
- Column widths: A=4, B=45, C=8, D=10, E=14, F=8, G=14, H=10, I=30, J=12, K=35, L=10

### Summary Row

Below the task list, add a summary row:
- Total estimated hours
- Total by stream
- Meetings count and total meeting hours

---

## Tab 2: History

Append-only log of all daily plans. Each day's tasks get appended as a batch.

### Columns

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | Date | Date | Plan date (YYYY-MM-DD) |
| B | Task | Text | Task title |
| C | Priority | Integer | Priority score at time of planning |
| D | Est. Hours | Decimal | Estimated duration |
| E | Actual Hours | Decimal | Actual time spent (null if not tracked) |
| F | Type | Text | `hands-on` or `delegatable` |
| G | Source | Text | Origin system |
| H | Status | Text | Final status: `done`, `deferred`, `dropped`, `partial` |
| I | Also Planned Prior | Boolean | Was this task also in a prior day's plan? (Informational — for velocity analysis, not carry-over logic) |
| J | Notes | Text | End-of-day notes |

### Formatting
- Header row: Same blue style as Today tab, frozen
- Date groups: Light gray separator row between dates
- Status coloring: Same as Today tab

---

## Tab 3: Recurring

Defines periodic tasks and their scheduling rules.

### Columns

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | Task | Text | Recurring task title |
| B | Description | Text | What this involves, context |
| C | Frequency | Text | `daily`, `weekly`, `biweekly`, `monthly`, or cron-like pattern |
| D | Est. Hours | Decimal | Typical duration |
| E | Priority Base | Integer (1-10) | Base priority (boosted when overdue) |
| F | Type | Text | `hands-on` or `delegatable` |
| G | Last Completed | Date | When this was last done |
| H | Next Due | Date | Calculated next due date |
| I | Max Defer Days | Integer | How many days past due before it becomes critical |
| J | Preferred Day | Text | Day of week preference, or blank for any |
| K | Active | Boolean | TRUE/FALSE — whether this recurring task is active |
| L | Notes | Text | Additional context |

### Example Rows

| Task | Frequency | Est. Hours | Priority | Type | Max Defer |
|------|-----------|------------|----------|------|-----------|
| Community PR review | biweekly | 1.0 | 4 | hands-on | 5 |
| Dependency audit | weekly | 0.5 | 3 | delegatable | 3 |
| 1:1 prep | weekly | 0.3 | 6 | hands-on | 0 |
| Sprint retro notes | biweekly | 0.5 | 5 | hands-on | 2 |
| Inbox zero pass | daily | 0.25 | 3 | hands-on | 1 |
| CI pipeline health check | weekly | 0.5 | 4 | delegatable | 4 |

### Formatting
- Header: Same blue style
- Overdue tasks (Next Due < today): Orange row highlight
- Inactive tasks: Gray text

---

## Tab 4: Velocity

Tracks estimation accuracy and throughput over time. Updated during end-of-day reconciliation.

### Columns

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | Date | Date | Day |
| B | Tasks Planned | Integer | How many tasks were in the plan |
| C | Tasks Completed | Integer | How many got done |
| D | Tasks Deferred | Integer | How many were pushed to another day |
| E | Est. Total Hours | Decimal | Sum of estimated hours |
| F | Actual Total Hours | Decimal | Sum of actual hours (from Harvest or manual) |
| G | Accuracy Ratio | Formula | =F/E (actual/estimated) |
| H | Completion Rate | Formula | =C/B |
| I | Plannable Hours | Decimal | How many hours were available (after meetings) |
| J | Utilization | Formula | =F/I |

### Summary Section (below data)

- Rolling 7-day averages for all metrics
- Rolling 30-day averages
- Trend indicators (improving/declining/stable)
- Current calibration factor (for adjusting future estimates)

### Formatting
- Header: Same blue style
- Accuracy Ratio: Conditional coloring
  - 0.8-1.2: Green (good estimates)
  - 0.5-0.8 or 1.2-1.5: Yellow (off but acceptable)
  - <0.5 or >1.5: Red (estimates need work)

---

## Tab 5: Config

User preferences and skill settings.

### Structure (Key-Value format)

| Key | Default | Description |
|-----|---------|-------------|
| work_hours_per_day | 8 | Total work hours |
| buffer_minutes | 30 | Unplanned buffer per day |
| morning_focus_hours | 3 | Hours before first meeting preferred for deep work |
| max_parallel_ai_streams | 2 | How many AI background streams |
| default_task_estimate | 1.0 | Hours, when no estimate available |
| high_priority_threshold | 8 | Priority score that makes a task "must-do" |
| medium_priority_threshold | 5 | Priority score for "should-do" |
| source_age_boost | 1 | Priority boost per day a task has been open in the source system (Jira/GitHub age, not planner history) |
| estimation_calibration | 1.0 | Multiplier applied to estimates (updated from Velocity) |
| jira_project_keys | | Comma-separated Jira project keys to monitor |
| github_repos | | Comma-separated repo names |
| slack_channels | | Key Slack channels to monitor |
| dashboard_url | | Web app URL from Apps Script deployment |
| spreadsheet_id | *(auto)* | Google Sheets ID (auto-populated on init) |
| planner_token | | Shared secret for API auth — must match DAILY_PLANNER_TOKEN env var |
| current_plan_date | *(auto)* | Date of the current Today plan (YYYY-MM-DD, auto-set on save) |
| trust_jira_api | 9 | Trust score for Jira API signals (1-10) |
| trust_github_api | 9 | Trust score for GitHub API signals |
| trust_harvest_api | 9 | Trust score for Harvest API signals |
| trust_slack_direct | 8 | Trust score for direct Slack @mentions |
| trust_confluence | 7 | Trust score for Confluence content |
| trust_slack_channel | 7 | Trust score for Slack channel activity |
| trust_outlook_calendar | 6 | Trust score for Outlook calendar events |
| trust_email_human | 6 | Trust score for human-written emails |
| trust_email_notification | 4 | Trust score for automated email notifications (verify against API before surfacing) |

### Formatting
- Simple key-value layout
- Keys in column A (bold), Values in column B, Descriptions in column C
- Light blue header row

---

## Tab 6: PlanJSON

Stores the full dashboard JSON blob written by the skill each morning. The Apps Script web app reads this tab to render the dashboard.

### Structure

No header row — row 1 IS the data. This is intentional because Code.gs reads A1 directly.

| Cell | Content | Description |
|------|---------|-------------|
| A1 | JSON string | The complete plan data object (stringified JSON) |
| B1 | Timestamp | ISO date-time when this plan was generated |

### Notes
- Overwritten each time the skill runs (not append-only)
- No header row (unlike other tabs) — `initialize()` creates the tab but does not write headers
- The Apps Script `doGet()` reads A1, parses the JSON, and passes it to `Dashboard.html`
- If B1 date doesn't match today, the dashboard falls back to reading the Today tab directly
- The JSON schema matches the dashboard's `PLAN_DATA` structure (top, more, email_highlights, possibly_overlooked, timeline, stats, notes)
