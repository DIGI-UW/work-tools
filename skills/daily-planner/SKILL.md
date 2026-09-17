---
name: daily-planner
description: >
  AI-powered daily work planner that synthesizes priorities from Jira, Slack, GitHub, Outlook, and Harvest
  into a structured, time-blocked daily plan with parallel work streams. Use this skill whenever the user
  asks to plan their day, review today's priorities, get a daily standup plan, check what they should work on,
  replan mid-day, or anything related to organizing their workday. Also triggers on scheduled 5am runs to
  generate the morning draft plan. Even casual phrasing like "what should I focus on today?" or "plan my day"
  should trigger this skill. Also triggers for end-of-day wrap-up, weekly planning, and time tracking questions.
---

## Prerequisites

### Deployment Modes

This skill supports two tool access modes. Use whichever fits your environment:

**Mode A: MCP Server (default)** — Requires the `work-tools` MCP server to be built and registered.
- Fastest, most capable (supports Outlook browser auth, Harvest CRUD, all 26 tools)
- Setup: `git clone` → `npm install && npm run build` → `claude mcp add`
- See [references/work-tools-index.md](references/work-tools-index.md) for the full tool catalog

**Mode B: Self-Contained Scripts** — No MCP server or git repo needed. Bundled Python scripts call Jira and Harvest APIs directly using only stdlib.
- Works anywhere Python 3 is available (Claude Desktop, Cowork, offline)
- Covers: Jira (read-only) and Harvest (read-only) — see `scripts/jira_client.py`, `scripts/harvest_client.py`
- Does NOT cover: Outlook (requires browser auth), Harvest write ops
- Run via bash: `python3 "${CLAUDE_SKILL_DIR}/scripts/jira_client.py" my-issues --max 10`

**Tool resolution order:** For each data source, try tools in this order:
1. Official Claude MCP integration (Atlassian MCP, GitHub MCP, Slack MCP) — most reliable when available
2. Local `work-tools` MCP server tools (`jira_*`, `harvest_*`, `outlook_*`) — full-featured fallback
3. Bundled Python scripts — self-contained fallback when no MCP server is available

If a tool call fails or the tool is not found, fall back to the next tier automatically.

**Report which tier was used.** After data gathering, record the tier used for each source in
`meta.data_sources` and in a `notes[]` entry titled "Data Sources". Use this format:
- `Jira ✓ (Atlassian MCP)` — tier 1 succeeded
- `Jira ✓ (local MCP)` — tier 1 failed, fell back to tier 2
- `Jira ✓ (script)` — tiers 1-2 failed, fell back to bundled script
- `Jira ✗ (all tiers failed)` — all three tiers failed
- `Harvest ✓ (local MCP)` — only tier 2 available (no official Claude integration)
- `Outlook ✓ (local MCP)` — only tier 2 available (no script fallback)
- `Outlook ✗ (token expired)` — failed with specific error

When a higher tier fails, include the failure reason in the notes entry so the user can fix the
integration (e.g., "Atlassian MCP: tool not found — check `claude mcp list`",
"Outlook: 401 token expired — run `warmup`"). Don't hide failures — the user needs to know
which integrations are broken so they can fix them.

### External Dependencies

**MCP Servers** (register with `claude mcp add --scope user`):
- `work-tools` — Outlook email/calendar + Harvest time tracking + Jira (local, `mcp-servers/work-tools/`) — *Mode A only*
- GitHub MCP — PR and issue tracking
- Atlassian MCP — Jira issue queries (preferred when available; local `jira_*` tools are the fallback)
- Slack MCP — channel search

**Environment Variables** (loaded by MCP server from `.env.local` or `~/.work-tools.env`, and by bundled scripts from env or `~/.work-tools.env`):
- `DAILY_PLANNER_URL` — Apps Script web app URL
- `DAILY_PLANNER_TOKEN` — Apps Script auth token
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — Required for Jira (both MCP and scripts)
- `HARVEST_ACCESS_TOKEN`, `HARVEST_ACCOUNT_ID` — Required for Harvest scripts (Mode B)
- See `skills/daily-planner/references/setup-guide.md` for Apps Script setup
- The bundled `scripts/sheets_helper.py` also loads from `.env` in CWD if shell env vars aren't set

**Outlook script fallback:** When MCP tools fail, the skill can use bundled `scripts/outlook_client.py` (Playwright token capture, same token file as MCP). See [references/work-tools-index.md](references/work-tools-index.md).

**Full tool reference:** See [references/work-tools-index.md](references/work-tools-index.md) for all available MCP tools and other skills.

# Daily Work Planner

You are building a prioritized, time-blocked daily work plan by synthesizing data from multiple sources.

**User configuration**: See [references/my-config.md](references/my-config.md) for identity, scope rules, excluded repos/calendars, and Jira/Slack config.

### Role-Based Behavior

Check the **Role → Flavor** field in [references/my-config.md](references/my-config.md#role).
The flavor changes how you weight data sources and structure the plan:

**`dev` (developer):**
- Primary signals: Jira sprint items, GitHub PRs/issues, Outlook calendar
- Email: aggressively filtered — only surface human-written emails with clear action items
- Plan structure: focus blocks for deep work, meetings as interruptions to schedule around
- Parallel streams: one hands-on focus stream + 1-2 AI-delegatable background streams

**`pm` (project manager):**
- Primary signals: Outlook calendar (meetings ARE the work), Outlook email (follow-ups, stakeholder threads)
- Jira: project-level oversight — blockers across teams, approaching deadlines. Not individual sprint tasks.
- GitHub: only include if a PR/release directly blocks a deliverable
- Email: surface broadly — threads needing reply, escalations, stakeholder requests, action items
- Plan structure: meetings are the core work blocks. Schedule 15-min prep/follow-up slots around each meeting. Non-meeting time is for email catch-up, document review, and delegation.
- Parallel streams: fewer AI-delegatable tasks (PM work is inherently collaborative)

If no Role is specified, default to `dev`.

**Scope: WORK tasks only.** This planner covers professional work. Personal tasks,
family errands, and household items must NOT appear in this plan unless the user explicitly asks
to include them. See [references/my-config.md](references/my-config.md#scope-rules) for specific exclusions.

If you encounter something ambiguous (e.g., a Slack message about a personal project in a work channel),
include it but flag it as "possibly personal".

## How This Skill Works

There are three modes of operation:

### Mode 1: Morning Draft (Scheduled / Unattended)
Runs automatically at 5am Pacific. Gathers data, builds the plan, saves it to the tracking sheet.
No human interaction — just produce the best plan you can and save it.

### Mode 2: Interactive Session (On-Demand)
Triggered when the user asks to review, adjust, or create a plan. This can happen:
- Morning review of the auto-generated draft
- Mid-day replan when priorities shift
- Ad-hoc "what should I work on?" moments

In interactive mode, adapt your review style to context:
- **Quick day**: Show the full plan, let the user make quick edits ("swap 3 and 5", "drop PR review")
- **Complex day**: Walk through flagged items that need decisions (ambiguous priority, scheduling conflicts, overloaded timeline)
- **Fresh plan**: If no draft exists, build one live through a brief structured interview

### Mode 3: End-of-Day Reconciliation
Triggered at end of day or next morning. Reconciles actual vs planned, updates history and velocity.

## Step 1: Gather Context

Query all available data sources. Run these in parallel where possible using subagents or
concurrent tool calls. Be resilient — if a source fails, note it and work with what you have.

**PM mode adjustment:** If the role is `pm`, gather Outlook calendar and email FIRST (they're
the primary signals). Jira and GitHub are secondary — skip GitHub entirely unless a release
or PR is specifically relevant to a deliverable the PM is tracking.

### 1.1 Jira

**Try the official Atlassian MCP first** (Claude-native integration). Use `searchJiraIssuesUsingJql`
(you'll need `getAccessibleAtlassianResources` first for the cloudId):
- `assignee = currentUser() AND sprint in openSprints() ORDER BY priority DESC`
- `assignee = currentUser() AND status changed AFTER -1d`
- `assignee = currentUser() AND duedate <= 7d AND status != Done`

**If the Atlassian MCP fails or is unavailable**, fall back to the **local work-tools MCP** Jira
tools (API token auth — no cloud ID needed, works reliably in Desktop and Cowork):
- `jira_my_issues` — your assigned non-Done issues, sorted by last updated
- `jira_search` with the same JQL queries above
- `jira_get_issue` — fetch full details (including description) for specific tickets

**If no MCP server is available**, use the **bundled Python script** (self-contained, stdlib-only):
```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/jira_client.py" my-issues --max 20
python3 "${CLAUDE_SKILL_DIR}/scripts/jira_client.py" search "assignee = currentUser() AND sprint in openSprints()" --max 20
python3 "${CLAUDE_SKILL_DIR}/scripts/jira_client.py" get-issue OGC-312
```
Requires `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` env vars (or in `~/.work-tools.env`).

Focus on: current sprint items, blocked/blocking issues, items approaching deadlines, recently
transitioned items (momentum indicators).

**Build `jira_summary[]`** from these results for the dashboard (see §3.1). Every issue returned
should appear in the summary with key, summary, status, priority, and a direct link — regardless
of which Jira connection was used.

### 1.2 Slack
Use `slack_search_public` to find actionable signals:
- `to:me after:yesterday` — direct mentions needing response
- `from:me after:yesterday` — what's already been handled (avoid double-counting)
- Search key project channels for recent activity

**Meeting discovery fallback**: If Outlook is unavailable, search Slack for meeting-related
messages — standup reminders, meeting links, calendar bot posts. Queries like
`"meeting" OR "standup" OR "sync" after:today` in team channels can surface today's schedule.
This is important because the Outlook local connection sometimes has token issues.

### 1.3 GitHub
**PM mode:** Skip this section unless a specific release or PR is blocking a deliverable.

**Dev mode:** Use the **GitHub MCP** tools (`mcp__github__list_pull_requests`, `mcp__github__search_pull_requests`,
`mcp__github__search_issues`, `mcp__github__list_issues`) for **work repositories only**.
Look for:
- Open PRs authored by the user (CI status, stale?)
- PRs where review is requested
- Assigned issues

**⚠️ Exclude personal repos** listed in [references/my-config.md](references/my-config.md#excluded-repositories-personal-not-work). Only include work repos.

### 1.4 Outlook (with fallback)
**Try** `outlook_list_events` for today and tomorrow, `outlook_list_emails` for recent items.

**Filter out automated Jira notification emails.** These are redundant — Step 1.1 already has
the authoritative Jira data via API. Jira notification emails are identifiable by:
- Sender: contains `@atlassian.net`, `jira@`, or `noreply`
- Subject: contains a Jira ticket key pattern (e.g., `[JIRA]`, `OGC-123`, `WSG-45`)
- These add zero signal the API doesn't already have, and clutter `email_highlights[]`

**Email filtering by role:**
- **Dev mode:** Aggressively filter. Only surface human-written emails that need a reply or contain clear action items. Most email is noise for developers.
- **PM mode:** Surface more broadly. Include threads needing reply, stakeholder requests, escalations, meeting follow-ups, and any email with an action item or decision request. Email is a primary work signal for PMs — err on the side of including rather than filtering.

**If Outlook MCP tools fail** (common — requires local token refresh), use the bundled script
before falling back to Slack:

1. **Tier 2 — Bundled script** (self-contained, no MCP server needed):
   ```bash
   python3 "${CLAUDE_SKILL_DIR}/scripts/outlook_client.py" list-events --start YYYY-MM-DD --end YYYY-MM-DD
   python3 "${CLAUDE_SKILL_DIR}/scripts/outlook_client.py" list-emails --limit 20 --from-date YYYY-MM-DD
   ```
   The script uses the same Chrome profile and token file as the MCP server — if one
   captured a token recently, the other benefits. If the token is expired, the script
   attempts headless auto-refresh via the persistent browser profile's SSO cookies.
   Parse the JSON output (same shape as the MCP tool responses).

2. **Tier 3 — Slack search** (if script also fails):
   Check Slack for meeting announcements (see 1.2 fallback above)

3. **Graceful degradation**: Note in the plan output that Outlook was unavailable so
   meeting data may be incomplete. Flag this to the user:
   "Outlook session expired — meetings may be missing. Run `python3 scripts/outlook_client.py refresh` or `warmup` to fix."

**⚠️ Check [references/my-config.md](references/my-config.md#excluded-calendar-sources) for excluded calendar sources.**
Do not use excluded calendars as work data sources.

### 1.5 Harvest
Use `harvest_weekly_summary` and `harvest_list_time_entries` for recent data:
- Hours logged this week (on track?)
- Active project distribution
- Budget utilization

**If no MCP server is available**, use the **bundled Python script**:
```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/harvest_client.py" weekly-summary
python3 "${CLAUDE_SKILL_DIR}/scripts/harvest_client.py" list-entries --from YYYY-MM-DD --to YYYY-MM-DD
python3 "${CLAUDE_SKILL_DIR}/scripts/harvest_client.py" list-projects
```
Requires `HARVEST_ACCESS_TOKEN`, `HARVEST_ACCOUNT_ID` env vars (or in `~/.work-tools.env`).

### 1.6 History & Recurring Tasks

Read the tracking sheet (Google Sheets via `scripts/sheets_helper.py`), but understand its role:
**the planner spreadsheet is a VIEW of reality, not a source of truth.** It is a rendering
layer — a lens through which the user sees a synthesized picture of their work. Past plans
are immutable snapshots useful for analytics, not carry-over signals.

**Read the spreadsheet FOR:**
- **Velocity data** — estimation calibration factor (actual vs estimated hours over time)
- **Recurring task schedule** — which periodic tasks are due or overdue
- **Pattern analysis** — how many tasks typically get done per day, throughput trends

**Do NOT read the spreadsheet FOR:**
- **Task carry-over** — if a task was planned yesterday and is still relevant, that relevance
  must be confirmed by the source system (GitHub PR still open? Jira ticket still in-progress?
  Slack thread still unresolved?). The planner's history saying "review PR #2504" yesterday
  doesn't mean it still needs review — check the GitHub API.
- **Priority signals** — source systems are authoritative on urgency and deadlines, not the
  planner's historical priority scores
- **Status updates** — a task marked "in-progress" in the planner doesn't mean it's still
  in progress today. Check the actual source API for current status.

This prevents circular reasoning: the planner shouldn't feed its own output back as input.
If a task keeps appearing because the source system confirms it's still open, that's correct
signal flow. If it appears because yesterday's plan said so, that's a feedback loop.

If the tracking sheet doesn't exist yet, the skill should still work — just skip history-based
features and note that the sheet needs to be initialized.

### 1.7 Cross-Verify Low-Trust Signals Against Source APIs

After gathering data from all sources, run a cross-verification pass on remaining low-trust
signals before they enter the priority scoring pipeline. This prevents stale notifications
from being surfaced as action items when the actual source system tells a different story.

**Note:** Jira notification emails are already filtered out in Step 1.4, so they never reach
this step. The only remaining low-trust signals to verify are Harvest reminders and GitHub
notification emails.

**The rule:** Any signal from a source with trust ≤ 4 (automated email notifications) that
references a system with an available API (trust ≥ 9) MUST be verified against that API
before being surfaced.

**Verification procedure:**

For each email/notification signal where `source_trust <= 4` and the email references
a system with an API (GitHub, Harvest):

1. **Identify the referenced entity** — PR number, week range, etc.
2. **Query the source API for current status:**
   - Harvest reminder email → `harvest_weekly_summary` for the referenced week. If hours are logged, drop the signal.
   - GitHub notification email → use the GitHub MCP to fetch the referenced PR/issue. If merged/closed, drop the signal.
3. **Outcome:**
   - **API contradicts email** → drop the signal, log the discrepancy in notes ("Harvest reminder for week of Feb 22 dropped — API shows 40h logged")
   - **API confirms email** → promote the signal to the API's trust level (it's now a verified API signal)
   - **API unavailable** → keep the signal but flag it as "unverified (API unavailable)" and note the uncertainty

This step runs AFTER all data gathering (Steps 1.1-1.6) and BEFORE priority scoring (Step 2.3),
so by the time we score tasks, all low-trust signals have been either promoted or dropped.

## Source Trust Scores

Not all data sources are equal. An API query returns current ground truth; an automated email
notification may be hours or days stale. The trust score system (1-10) ensures higher-quality
signals carry more weight in priority scoring and conflict resolution.

**Default trust scores** (configurable via Config tab — see `references/sheet-structure.md`):

| Source | Trust | Rationale |
|--------|-------|-----------|
| Jira API | 9 | Source of truth for ticket status, priority, sprint assignment |
| GitHub API | 9 | Source of truth for PR status, CI results, review requests |
| Harvest API | 9 | Source of truth for hours logged, project distribution |
| Slack (direct @mention) | 8 | High signal — someone specifically addressed the user |
| Confluence | 7 | Task assignments, meeting notes, specs — human-curated |
| Slack (channel activity) | 7 | Important team context, but noisier than direct mentions |
| Outlook calendar | 6 | Meeting blocks are useful, but lots of noise (holds, optionals, stale recurring) |
| Email (human-written) | 6 | Direct communication but mixed signal quality |
| Email notification (Harvest/GitHub) | 4 | Often stale, duplicates API data — verify against source before surfacing |
| Email notification (Jira) | — | **Filtered out in Step 1.4.** Jira data comes from API (Step 1.1). |
| Planner spreadsheet | — | **NOT a source.** It's a view. See Step 1.6. |

**How trust scores are used:**

1. **Priority scoring (Step 2.3)**: Weight signals from higher-trust sources more heavily.
   A Jira ticket marked "critical" (trust 9) outweighs a Slack channel mention saying
   "when you get a chance" (trust 7).

2. **Conflict resolution**: When two sources disagree about the same entity, the higher-trust
   source wins:
   - API data (trust 9) overrides email notifications about the same system (trust 4)
   - Direct Slack @mentions (trust 8) override inferred activity from channel scanning (trust 7)
   - If a source-system API confirms a task is done, drop it — even if lower-trust sources suggest otherwise

3. **Cross-verification (Step 1.7)**: Signals from trust ≤ 4 sources that reference a system
   with an available API (trust ≥ 9) must be verified before surfacing. This is the mechanism
   that prevents stale "Harvest past due" emails from appearing when Harvest API shows hours logged.

4. **Dashboard notes**: The `notes[]` section should include a "Data Sources" entry showing
   which sources were consulted and any cross-verification outcomes ("Harvest reminder dropped —
   API confirms 40h logged for week of Feb 22").

**Reading trust scores from Config:** The scores are stored in the Config tab as key-value
pairs (e.g., `trust_jira_api = 9`). Read them via `sheets.get_config()` at the start of each
planning run. If Config doesn't have them yet, use the defaults above.

## Step 2: Build the Plan

### 2.1 Time Budget

Start with available hours. A typical day is 8 hours, but subtract:
- Meeting time (from calendar sources)
- Standing commitments
- Buffer (~30min for interrupts)

This gives you the **plannable hours** for the day.

### 2.2 Task Inventory

Compile all candidate tasks from the data sources. For each task:

| Dict Key | Description |
|----------|-------------|
| **task** | Clear, actionable task title (under 40 chars for dashboard) |
| **priority** | 1-10 scale (10 = most urgent) |
| **est_hours** | Estimated duration in hours. Calibrate from velocity history if available |
| **type** | `hands-on` or `delegatable` |
| **stream** | `A` (focus), `B` (AI background), `C` (AI-2), `M` (meeting) |
| **time_block** | Suggested time range, e.g., "9:00-10:30" |
| **source** | Where it came from: `jira`, `slack`, `github`, `outlook`, `harvest`, `recurring` |
| **source_link** | **REQUIRED.** Direct clickable URL to the source item. Jira: `https://{site}.atlassian.net/browse/{KEY}`. GitHub PR: `https://github.com/{org}/{repo}/pull/{num}`. GitHub issue: `.../issues/{num}`. Confluence: page URL. Harvest: leave empty only for Harvest. The dashboard renders the task title as a clickable link using this field — omitting it degrades UX. |
| **status** | `planned`, `in-progress`, `done`, `deferred`, `dropped` |
| **notes** | Context, flags, dependencies, deadlines |
| **actual_hours** | Filled during/after work (for velocity tracking) |

> **Field name convention**: When _writing_ via `save_today_plan()`, use **lowercase snake_case** keys
> (task, priority, est_hours). When _reading_ via `get_today_plan()`, keys come back as **Title Case**
> matching the sheet headers (Task, Priority, Est. Hours). This asymmetry is inherent to the Apps Script
> layer which reads headers directly from the spreadsheet.

### 2.3 Priority Scoring

Combine multiple signals into a priority score (1-10), weighted by source trust (see
"Source Trust Scores" section below Step 1):

- **Urgency**: Deadline proximity, blocker status, people waiting. Weight by source trust —
  a Jira critical flag (trust 9) outweighs a Slack mention saying "when you get a chance" (trust 7).
- **Impact**: Story points, business value, number of people unblocked
- **Momentum**: Is this actively in-progress in the source system? Check the API — a GitHub PR
  with recent commits has real momentum. A task that was "in-progress" in yesterday's plan but
  has no source-system activity does not.
- **Commitment**: Was this promised in standup, sprint planning, or a thread?
- **Source-confirmed persistence**: If a source system shows a task has been open/active for
  multiple days (PR created 3 days ago and still open, Jira ticket in-progress since Monday),
  give it a small boost (+1). This signal comes entirely from the source API's timestamps and
  status — NOT from reading the planner's own history. The question is "how long has this been
  open in Jira/GitHub?" not "how many days did this appear in past plans?"

### 2.4 Inject Recurring Tasks

Check the recurring tasks schedule (from the Recurring tab via `sheets.get_due_recurring_tasks()`).
For each periodic task:
- **Due today or overdue**: include it, boost priority by +2 per day overdue
- **Due within 3 days** and today has slack: pull it forward
- **Today is overloaded**: defer it (up to its max deferral window)
- **Beyond max deferral**: force-include regardless of load — it's become critical

### 2.5 Schedule into Streams

Lay out the day as time blocks across parallel streams:

**Stream A: Hands-on Focus** — What the user is actively working on. One task at a time,
ordered by priority. Place deep-work items in the morning when possible.

**Stream B: AI Background** — Tasks delegated to AI agents (Copilot, Claude Code).
Run in parallel with Stream A. Examples: "AI: generate test suite for feature X",
"AI: draft PR description for Y", "AI: run dependency audit".

**Stream C: AI Background 2** (optional) — A second AI stream if there's enough
delegatable work AND the day has 4+ plannable hours. For constrained days (under 4h),
combining into a single AI stream is better — splitting too thin creates more
check-in overhead than it saves.

**Meetings & Breaks** — Fixed blocks from the calendar.

**AI stream sizing guidance**: AI streams work best when there's enough plannable time
for the delegated work to complete AND for the user to review the output. A 30-minute
AI task in a 2-hour afternoon is fine. But spinning up 2 AI streams for a 2-hour
window creates more coordination overhead than value. Use judgment — the goal is to
maximize the user's effective throughput, not to always fill every stream.

### 2.6 Plan Validation

Before finalizing, check:
- Total estimated time ≤ plannable hours (with buffer)
- No two hands-on tasks overlap
- Delegatable tasks have clear enough specs for AI agents
- High-priority items aren't pushed to end of day
- Tasks still open in source systems (not just "carried over" from yesterday's plan) are addressed
- The plan focuses on WORK tasks only — no personal/family projects, no Google Calendar events

## Step 3: Present the Plan

The plan has two outputs: (1) a compact chat summary, and (2) a structured JSON dashboard blob
that powers the visual post-it dashboard. Both are important — the chat summary is what the user
sees first, and the dashboard is what they bookmark and glance at throughout the day.

### 3.1 Dashboard JSON

The primary output is a JSON object saved to the PlanJSON tab in Google Sheets (via
`sheets.write_plan_json(data)`) and also saved as `daily-plan-dashboard.json` in the
outputs directory. The Apps Script web app reads this JSON and renders the post-it dashboard.

`write_plan_json()` accepts **two formats**, but **always use skill format**:
- **Skill format** (with `tasks[]` and `meta{}`) — **PREFERRED**. Auto-converted to dashboard
  format by `convertSkillPlanToDashboard_()` in Code.gs. This conversion correctly populates
  all header fields (`date`, `generated`, `plannable_hours`, `capacity_label`) from `meta{}`.
- **Dashboard format** (with `top[]`/`more[]`) — rendered directly, but fragile: if you forget
  any header field the dashboard shows "Generated undefined" and blank stats. Avoid this format.

**Always push in skill format** — let the server-side conversion handle the dashboard mapping.

#### Skill JSON Schema (the format you produce)

This is the canonical format the skill should output. `convertSkillPlanToDashboard_()` in
Code.gs transforms it into the dashboard rendering format automatically.

```json
{
  "meta": {
    "date": "Thursday, March 5, 2026",
    "date_key": "2026-03-05",
    "generated": "8:30 PM PT",
    "plannable_hours": 6.5,
    "capacity": "green",
    "capacity_label": "Focused",
    "data_sources": "Jira ✓ (local MCP) · Slack ✓ · Outlook ✗ (token expired) · GitHub ✓ · Harvest ✓ (script)"
  },
  "tasks": [
    {
      "task": "Short clear task name (under 40 chars)",
      "priority": 10,
      "est_hours": 3,
      "type": "hands-on",
      "stream": "A",
      "time_block": "9:00-12:00",
      "source": "jira",
      "source_link": "https://...",
      "status": "in-progress",
      "notes": "Brief status note",
      "color": "purple-tint",
      "context": "Full context paragraph — why this matters, what to do, dependencies",
      "acceptance": ["Criterion 1", "Criterion 2"],
      "decision": "Key decision or tradeoff to resolve today",
      "ai_help": "What AI streams are doing to support this task",
      "nudge": null
    }
  ],
  "more_tasks": [
    {
      "task": "Lower priority task name",
      "priority": 5,
      "est_hours": 1,
      "type": "hands-on",
      "stream": "A",
      "source": "confluence",
      "source_link": "",
      "status": "planned",
      "notes": "Brief note",
      "color": "sand",
      "nudge": "deferred"
    }
  ],
  "timeline": [
    { "time": "9:00", "task": "Task name", "note": "Brief note", "bar_color": "var(--stream-a)", "duration": 180 },
    { "time": "9:00", "task": "AI: Background work", "note": "Description", "bar_color": "var(--stream-b)", "duration": 90, "parallel": true },
    { "time": "12:30", "task": "Lunch", "note": "", "bar_color": "#c0c0c0", "duration": 30 },
    { "time": "3:00", "task": "Team Sync", "note": "", "bar_color": "#1565c0", "duration": 30, "meeting": true }
  ],
  "stats": [
    { "value": "4.5h", "label": "Hands-On" },
    { "value": "2h", "label": "AI Parallel" },
    { "value": "1", "label": "Meetings" },
    { "value": "0h", "label": "Logged" }
  ],
  "jira_summary": [
    { "key": "OGC-312", "summary": "Non-Conformity Overhaul", "status": "To be assigned", "priority": "Medium", "type": "Epic", "link": "https://uwdigi.atlassian.net/browse/OGC-312", "overdue": false },
    { "key": "OGC-303", "summary": "Turn Around Time Reports", "status": "In Progress", "priority": "High", "type": "Task", "link": "https://uwdigi.atlassian.net/browse/OGC-303", "overdue": true }
  ],
  "email_highlights": [
    { "subject": "Email subject", "from": "Sender Name", "snippet": "Brief preview text", "tag": "email", "link": "https://uwdigi.atlassian.net/browse/OGC-416" }
  ],
  "possibly_overlooked": [
    { "subject": "Item title", "from": "#channel-name", "snippet": "Why this might be missed", "tag": "slack", "link": "https://github.com/DIGI-UW/OpenELIS-Global-2/pull/2794" }
  ],
  "notes": [
    { "title": "AI Stream Details", "content": "<b>Stream B:</b> Description of AI work..." },
    { "title": "Data Sources", "content": "<b>Jira</b> ✓ (Atlassian MCP) · <b>Slack</b> ✓ · <b>Outlook</b> ✗ token expired — run warmup · <b>GitHub</b> ✓ · <b>Harvest</b> ✓ (local MCP)" }
  ]
}
```

**Skill JSON field reference:**

| Section | Field | Type | Required | Notes |
|---------|-------|------|----------|-------|
| **meta** | `date` | string | ✓ | Human-readable: "Thursday, March 5, 2026" |
| | `date_key` | string | ✓ | Machine-readable: "2026-03-05" (YYYY-MM-DD). Used for archiving. |
| | `generated` | string | ✓ | When plan was built: "8:30 PM PT" |
| | `plannable_hours` | number | ✓ | Available hours after meetings/buffer |
| | `capacity` | string | ✓ | "green", "amber", or "red" |
| | `capacity_label` | string | ✓ | "Balanced", "Focused", "Tight", "Overloaded" |
| | `data_sources` | string | — | Source status with tier used, e.g. "Jira ✓ (Atlassian MCP) · Outlook ✗ (expired)" |
| **tasks[]** | `task` | string | ✓ | Task title (under 40 chars). **Must be `task`, not `title`.** |
| | `priority` | number | ✓ | 1-10 (10 = most urgent). Top 3 by priority become dashboard Focus cards. |
| | `est_hours` | number | ✓ | Duration in hours. **Must be `est_hours`, not `est_minutes` or `est`.** |
| | `type` | string | ✓ | "hands-on" or "delegatable" |
| | `stream` | string | ✓ | "A", "B", "C", "A+B", "M" |
| | `time_block` | string | — | "9:00-12:00" format |
| | `source` | string | ✓ | "jira", "slack", "github", "outlook", "harvest", "email", "confluence", "recurring" |
| | `source_link` | string | — | Direct URL to source item |
| | `status` | string | — | "planned", "in-progress", "done", "deferred", "dropped" |
| | `notes` | string | — | Brief status note |
| | `color` | string | — | Card color (see palette below). Auto-assigned if omitted. |
| | `context` | string | — | Full context for expanded card detail |
| | `acceptance` | string[] | — | Acceptance criteria list |
| | `decision` | string | — | Key decision to resolve |
| | `ai_help` | string | — | AI stream support description |
| | `nudge` | string | — | "carried over", "deferred", "past due", or null |
| **more_tasks[]** | *(same shape as tasks[])* | | — | Lower-priority tasks that go to "Also On Deck" section |
| **timeline[]** | `time` | string | ✓ | "9:00" or "13:30" format |
| | `task` | string | ✓ | Task name |
| | `note` | string | — | Brief note |
| | `bar_color` | string | ✓ | CSS color: var(--stream-a), var(--stream-b), #c0c0c0, #1565c0 |
| | `duration` | number | ✓ | Minutes |
| | `parallel` | boolean | — | true for AI background tasks (renders indented) |
| | `meeting` | boolean | — | true for meetings (renders with meeting style) |
| **stats[]** | `value` | string | ✓ | Display value: "4.5h", "2", "0h" |
| | `label` | string | ✓ | Label: "Hands-On", "AI Parallel", "Meetings", "Logged" |
| **jira_summary[]** | `key` | string | ✓ | Issue key: "OGC-312" |
| | `summary` | string | ✓ | Issue title |
| | `status` | string | ✓ | Current status: "In Progress", "To be assigned", etc. |
| | `priority` | string | ✓ | Priority: "High", "Medium", "Low" |
| | `type` | string | — | Issue type: "Epic", "Task", "Story", "Bug" |
| | `link` | string | ✓ | Direct URL: `https://{site}.atlassian.net/browse/{KEY}` |
| | `overdue` | boolean | — | true if duedate is past and status != Done |
| **email_highlights[]** | `subject` | string | ✓ | Email subject line (human emails only — Jira notifications filtered) |
| | `from` | string | ✓ | Sender name |
| | `snippet` | string | ✓ | Brief preview/action needed |
| | `tag` | string | ✓ | Always "email" for this section |
| | `link` | string | — | **Strongly recommended.** Clickable URL to the referenced item (Jira ticket, GitHub PR, Confluence page, etc.). Dashboard renders subject as a link when present. |
| **possibly_overlooked[]** | `subject` | string | ✓ | Item title |
| | `from` | string | ✓ | Source channel/tool |
| | `snippet` | string | ✓ | Why this might be missed |
| | `tag` | string | ✓ | "slack", "github", "jira", or "other" |
| | `link` | string | — | **Strongly recommended.** Clickable URL to the item. Dashboard renders subject as a link when present. |
| **notes[]** | `title` | string | ✓ | Collapsible section title (plain text) |
| | `content` | string | ✓ | Body HTML (basic: `<b>`, `<a>` allowed — rendered unescaped) |

#### Conversion Mapping: Skill → Dashboard

`convertSkillPlanToDashboard_()` transforms the skill format to the dashboard rendering format.
Key transformations:

| Skill field | → | Dashboard field | Notes |
|-------------|---|-----------------|-------|
| `meta.date` | → | `date` | Passed through as-is |
| `meta.generated` | → | `generated` | Falls back to server time |
| `meta.plannable_hours` | → | `plannable_hours` | Falls back to config default |
| `meta.capacity` | → | `capacity` | |
| `meta.capacity_label` | → | `capacity_label` | |
| `tasks[] + more_tasks[]` | → | merged, sorted by priority | **All tasks are merged and re-sorted.** |
| merged[0..2] | → | `top[]` | Top 3 by priority become Focus cards |
| merged[3..n] | → | `more[]` | Remainder becomes "Also On Deck" |
| `t.task` | → | `card.title` | **Must use `task` key, not `title`** |
| `t.est_hours` | → | `card.est` | Formatted as "3h". **Must use `est_hours`, not `est_minutes`** |
| `t.context` | → | `card.detail.context` | |
| `t.acceptance` | → | `card.detail.acceptance` | |
| `t.decision` | → | `card.detail.decision` | |
| `t.ai_help` | → | `card.detail.ai_help` | |
| `t.time_block` | → | `card.meta` | Falls back to `t.notes` |
| `t.color` | → | `card.color` | Auto-assigned from palette if missing |
| `timeline[]` | → | `timeline[]` | Passed through |
| `stats[]` | → | `stats[]` | Passed through |
| `jira_summary[]` | → | `jira_summary[]` | Passed through |
| `email_highlights[]` | → | `email_highlights[]` | Passed through |
| `possibly_overlooked[]` | → | `possibly_overlooked[]` | Passed through |
| `notes[]` | → | `notes[]` | Passed through. **Content rendered as HTML (not escaped).** |

**Important conversion behaviors:**
- **Top-3 cutoff**: Only the 3 highest-priority tasks (after merging `tasks[]` + `more_tasks[]`)
  become Focus cards. If you put 4 items in `tasks[]`, the 4th is demoted to "Also On Deck".
  To guarantee a task appears as a Focus card, give it priority ≥ 8.
- **Color auto-assignment**: Top 3 get `purple-tint`, `gold-tint`, `sage`. More tasks cycle
  through `slate`, `lavender`, `sage`, `sand`, `gold-tint`, `purple-tint`. Explicit `color`
  in the skill JSON overrides auto-assignment.
- **Validation**: `validateSkillPlan_()` runs before conversion. It fixes common issues
  in-place (e.g., `title` → `task` rename, missing defaults) and logs warnings/errors.
  Plans with validation errors are still stored (non-blocking) but issues are logged.

The dashboard format follows this structure:

```json
{
  "date": "Wednesday, March 4, 2026",
  "generated": "9:00 AM PT",
  "plannable_hours": 7.5,
  "capacity": "green",
  "capacity_label": "Balanced",
  "top": [
    {
      "rank": 1,
      "title": "Short clear task name",
      "color": "purple-tint",
      "nudge": "carried over",
      "est": "3h",
      "stream": "A",
      "source": "Jira",
      "source_link": "https://...",
      "meta": "In Progress · day 2",
      "detail": {
        "context": "Why this matters and what to do",
        "acceptance": ["Criterion 1", "Criterion 2"],
        "decision": "Key decision or tradeoff to make",
        "ai_help": "What AI streams are doing to support this"
      }
    }
  ],
  "more": [
    {
      "title": "Additional task",
      "color": "slate",
      "est": "1h",
      "stream": "A",
      "source": "Jira",
      "source_link": "https://...",
      "meta": "Medium priority · Can defer",
      "detail": { "context": "Brief context" }
    }
  ],
  "timeline": [
    { "time": "9:00", "task": "Task name", "note": "Brief note", "bar_color": "var(--stream-a)", "duration": 60 },
    { "time": "9:30", "task": "AI: Background work", "note": "Description", "bar_color": "var(--stream-b)", "duration": 90, "parallel": true },
    { "time": "3:00", "task": "Team Sync", "note": "", "bar_color": "#1565c0", "duration": 30, "meeting": true }
  ],
  "stats": [
    { "value": "4.5h", "label": "Hands-On" },
    { "value": "2h", "label": "AI Parallel" },
    { "value": "1", "label": "Meetings" },
    { "value": "0h", "label": "Logged" }
  ],
  "jira_summary": [
    { "key": "OGC-312", "summary": "Non-Conformity Overhaul", "status": "To be assigned", "priority": "Medium", "type": "Epic", "link": "https://...", "overdue": false }
  ],
  "email_highlights": [
    { "subject": "Email subject", "from": "sender", "snippet": "Brief preview text", "tag": "email", "link": "https://..." }
  ],
  "possibly_overlooked": [
    { "subject": "Item title", "from": "source channel/tool", "snippet": "Why this might be overlooked", "tag": "slack|github|jira|other", "link": "https://..." }
  ],
  "notes": [
    { "title": "AI Stream Details", "content": "HTML-safe description..." },
    { "title": "Data Sources", "content": "<b>Jira</b> ✓ (local MCP) · <b>GitHub</b> ✓ · <b>Outlook</b> ✗ (token expired — run warmup) · <b>Harvest</b> ✓ (script fallback)" }
  ]
}
```

**Capacity values**: `"green"` (balanced — work fits), `"amber"` (tight — up to 1.2x plannable hours), `"red"` (overloaded — beyond 1.2x).

**Card color names** (UW-derived palette, friendly — no reds or alarm colors):
- Top 3: rank 1 = "purple-tint", rank 2 = "gold-tint", rank 3 = "sage"
- More tasks, cycle through: "slate", "lavender", "sage", "sand", "gold-tint", "purple-tint"
- Use `"nudge": "carried over"` or `"nudge": "past due"` instead of urgent badges — these
  render as a small soft-gold label, not an alarm.
- **Never** use red/yellow colors or "OVERDUE" badges. Keep the tone calm and friendly.

**Stream values**: "A" (hands-on), "B" (AI background), "A+B" (needs both), "C" (second AI stream).

**Timeline bar_color values**: `var(--stream-a)` for hands-on, `var(--stream-b)` for AI, `var(--uw-purple-muted)` for meetings, `#c0c0c0` for breaks.

### Link Construction (REQUIRED)

Every task, email highlight, and overlooked item that references a trackable resource MUST include
a working clickable link. The dashboard renders titles and subjects as clickable links — without
them, the user has to manually navigate to find each item. Use these patterns:

| Source | URL Pattern |
|--------|-------------|
| **Jira** | `https://{site}.atlassian.net/browse/{KEY-123}` |
| **GitHub PR** | `https://github.com/{org}/{repo}/pull/{number}` |
| **GitHub Issue** | `https://github.com/{org}/{repo}/issues/{number}` |
| **GitHub PR list** | `https://github.com/{org}/{repo}/pulls?q=is%3Apr+is%3Aopen+review-requested%3A{user}` |
| **Confluence** | Use the page URL from the Confluence API result |
| **Slack thread** | `https://{workspace}.slack.com/archives/{channel_id}/p{ts_no_dot}` |
| **Harvest** | Leave empty (no direct-link support) |
| **Outlook** | Leave empty (no web link from local API) |

For **tasks[]** and **more_tasks[]**: set `source_link`.
For **email_highlights[]** and **possibly_overlooked[]**: set `link`.
When an email references a GitHub PR, use the *underlying item's* URL, not the email itself.

**Jira Summary** (`jira_summary[]`): Built from Step 1.1 API results. Every assigned issue should
appear here with key, summary, status, priority, type, link, and overdue flag. This is the
dedicated Jira panel — more scannable than scattered email subject lines. Jira data ONLY comes
from the API, never from email notifications (which are filtered in Step 1.4).

**Email Highlights** (`email_highlights[]`): Populated from Outlook email scan (`outlook_list_emails`).
Include 3-5 most relevant **human-written** work emails — action items, important FYIs, things
that need a reply. Automated Jira notification emails are filtered out (Step 1.4). Tag each as
`"email"`. These are exclusively from Outlook; do NOT mix in Slack or other sources here.

**Possibly Overlooked** (`possibly_overlooked[]`): Cross-source signals that might slip through
the cracks. This is a SEPARATE section from emails and Jira. Sources include:
- Slack: unresponded direct mentions, threads you started but didn't follow up on
- GitHub: stale PRs (no activity >2 days), review requests you haven't acted on
- General: anything from the data gathering step that didn't make it into the main task list
  but still deserves awareness
Tag each item as `"slack"`, `"github"`, or `"other"`. (Jira items belong in `jira_summary[]`.)

These are three distinct dashboard sections — `jira_summary` shows a scannable ticket table,
`email_highlights` shows a collapsible email summary panel, and `possibly_overlooked` shows
a separate "might have missed" panel. All should be populated when the data sources are available.

**Always populate ALL dashboard sections** — don't leave `jira_summary`, `email_highlights`,
`possibly_overlooked`, or `notes` as empty arrays. Even on light days, include Jira tickets from
the API, scan Outlook emails for highlights, check for stale PRs/Slack mentions for the
"possibly overlooked" section, and include data source status and AI stream details in notes.
An empty dashboard looks broken; a populated one looks useful.

**Keep top titles SHORT** — under 40 characters. Details go in the expandable `detail` object.
The dashboard renders the top 3 as large sticky notes and the rest as smaller cards. Think of
the top section as what you'd write on a physical post-it stuck to your monitor.

### 3.2 Chat Summary

After building the JSON, present a brief chat summary. Keep it SHORT — the dashboard is the
detailed view. The chat summary is just the headlines:

```
📋 **[Day] Plan** — [plannable hours]h available

1. [Top task title] (est. Xh)
2. [Second task] (est. Xh)
3. [Third task] (est. Xh)

🤖 AI streams: [count] background tasks queued
📊 [X]h hands-on + [Y]h AI + [Z] meetings

📊 Dashboard: <URL>
```

**Dashboard URL — CRITICAL: never let the LLM "type" this URL.** The Apps Script web app URL
contains opaque deployment IDs with mixed-case characters that LLMs reliably mangle when
reconstructing from context. Instead:

1. Read the URL from the Config tab (key: `dashboard_url`) into a variable at the start of
   the planning run (during the `sheets.get_config()` call in Step 1).
2. Store it as-is — do NOT paraphrase, abbreviate, or re-type it.
3. In the chat summary, emit the URL by echoing the stored value directly:
   ```python
   # In sheets_helper.py or inline:
   config = sheets.get_config()
   dashboard_url = config.get("dashboard_url", "")
   ```
   Then in the chat output, use the variable: `f"📊 Dashboard: {dashboard_url}"`
4. If the Config tab doesn't have the URL yet, say: "Deploy the Apps Script and add
   `dashboard_url` to the Config tab."

**Why:** Opaque strings (deployment IDs, tokens, UUIDs) must flow through tool output and
variable interpolation, never through LLM text generation. The LLM may drop or swap characters
in strings it doesn't "understand" — especially mixed-case sequences like `jJ` in Google
deployment IDs.

The dashboard JSON should also include the URL in a top-level `dashboard_url` field so the
standalone HTML output can link back to the live version. Copy it from the same stored variable.

That's it for the chat output — resist the urge to dump the full plan into chat. The post-it
dashboard is where the detail lives, and the user can click to expand any card.

### 3.3 Flags for Interactive Review

Flag items that need the user's input:
- Tasks where priority is ambiguous (two urgent items competing)
- Scheduling conflicts (more work than hours)
- Recurring tasks that could be pulled forward or deferred
- Tasks open in source systems for 2+ days (long-lived PRs, stale Jira tickets)
- Items where AI delegation feasibility is uncertain
- **Data source failures** (e.g., "Outlook unavailable — meetings may be missing")

## Step 4: Persistence — Google Sheets

The plan and history are persisted in a Google Sheets spreadsheet, the single source of truth
accessible from any device. Read `references/sheet-structure.md` for tab structure and formatting.

### Google Sheets Access

Use `scripts/sheets_helper.py` — it talks to the Apps Script web app via HTTP.
No service account, no gspread, no pip dependencies beyond stdlib.

```python
from sheets_helper import DailyPlannerSheets

# Reads DAILY_PLANNER_URL and DAILY_PLANNER_TOKEN env vars
sheets = DailyPlannerSheets()
sheets.initialize()  # Creates all 6 tabs, headers, formatting, defaults — safe to call repeatedly

# Save today's plan
sheets.save_today_plan(tasks)

# Write dashboard JSON to PlanJSON tab
sheets.write_plan_json(plan_data)

# Read for review
plan = sheets.get_today_plan()
recurring = sheets.get_due_recurring_tasks()

# End-of-day
sheets.archive_day("2026-03-04", completed_tasks)
sheets.log_velocity(velocity_data)
```

**Auto-initialization**: The `initialize()` method (via Apps Script) does everything from a
blank spreadsheet: creates all 6 tabs, writes headers with formatted dark-blue header rows,
sets column widths, populates Config defaults, seeds the Recurring tab with sample tasks,
adds conditional formatting to the Today tab, and removes the default Sheet1.

**Setup**: The working folder's `.env` file provides `DAILY_PLANNER_URL` (the deployed
Apps Script web app URL) and `DAILY_PLANNER_TOKEN` (shared secret matching `planner_token`
in the Config tab). See [references/setup-guide.md](references/setup-guide.md) Part 4.

**Credentials loading**: `sheets_helper.py` walks a priority-ordered candidate list to find
the `.env` file: `$DAILY_PLANNER_ENV_FILE` (explicit override) → `./.env` (cwd) →
`~/Documents/DailyPlanner/.env` (workspace default) → `~/.daily-planner.env` (home-dir
fallback). The skill no longer has to run from the planner folder — bash invocations from
Cowork session sandboxes or scheduled tasks will find the workspace `.env` via candidate 3.
The chosen path is logged to stderr. Shell env vars always take precedence over file-loaded
values.

**If credentials are not found**: The skill should still work — skip persistence operations,
present the plan in chat only, and remind the user to set up per `references/setup-guide.md`.

### Spreadsheet Tabs

1. **Today** — Current day's plan (active view)
2. **History** — Append-only log of past plans with completion status
3. **Recurring** — Periodic task definitions and scheduling rules
4. **Velocity** — Estimation accuracy and throughput metrics
5. **Config** — Settings, source priorities, time defaults
6. **PlanJSON** — Full dashboard JSON blob (written by skill, read by Apps Script dashboard)

### Sheet Operations

When saving a plan:
1. Archive yesterday's "Today" data → append to "History" with completion status
2. Clear and populate "Today" with the new plan
3. Write the dashboard JSON to the "PlanJSON" tab via `sheets.write_plan_json(plan_data)`
4. Update "Velocity" with yesterday's actual vs estimated
5. Update "Recurring" task last-run dates for any completed periodic tasks
6. Also save `daily-plan-dashboard.json` to the outputs directory

When loading for review:
1. Read "Today" tab for the current draft
2. Read "Recurring" for periodic task status
3. Read "Velocity" for estimation calibration data

## Step 5: Interactive Review Commands

When the user is reviewing the plan, support natural language adjustments:

- **"swap 3 and 5"** — Reorder tasks
- **"drop the PR review"** — Remove a task (defer to next eligible day in Recurring)
- **"add: investigate flaky test, ~1h, hands-on"** — Add a task
- **"make X delegatable"** — Change task type
- **"move Y to AI stream"** — Reassign to background stream
- **"push X to tomorrow"** — Explicitly defer
- **"looks good" / "approve"** — Lock in the plan and update the sheet
- **"how's my week looking?"** — Brief weekly forecast from recurring tasks + known deadlines
- **"what's still open?"** — Show tasks that source systems confirm are still active/unresolved

After approval, update the tracking sheet and confirm.

## Step 6: End-of-Day Reconciliation

If triggered at end of day (or next morning before the new plan), reconcile:
- Mark completed tasks in History with final status (`done`, `partial`, `deferred`, `dropped`)
- For incomplete tasks, record their status in History for velocity analysis — but do NOT
  "carry them forward" into tomorrow's plan. Tomorrow's plan will discover still-open tasks
  fresh from source APIs (Jira, GitHub, etc.). The History record is retrospective, not prescriptive.
- Log actual time vs estimated time for velocity tracking
- Update recurring task schedules (mark completed ones, advance Next Due)
- Cross-reference with Harvest time entries for actual hours where possible

## Important Notes

### Setup Guide
A complete step-by-step guide is bundled in `references/setup-guide.md`. It covers:
- Picking a planner folder and creating a `.env` settings file
- Creating a spreadsheet and adding the Apps Script code
- Authorizing and deploying the web app (dashboard + API in one)
- Personalizing your config
- Testing and scheduling the morning auto-run

~10 minutes total, no terminal commands required.

If the user asks about setup, configuration, or how to get started, point them to this guide.

### First-Run Bootstrap
The spreadsheet is initialized automatically — when `doGet` runs and the Config tab
doesn't exist, it calls `initializeSheet()` first. This happens during the one-time authorization
step in setup. The Python `sheets.initialize()` also works as a fallback (idempotent).

The init function creates all 6 tabs, writes formatted headers, populates Config defaults
and sample recurring tasks, adds conditional formatting, and removes the default Sheet1.

On the first skill run, build the plan without history/velocity data — use source estimates
directly. Note in the output that this is a fresh start and estimates will improve over time.

### Estimation Calibration
After ~2 weeks of history data, the skill should start adjusting estimates using the
calibration factor from the Velocity tab. For example, if the user's Jira tasks typically
take 1.3x the estimate, multiply all Jira-sourced estimates by 1.3.

### Privacy & Scope
Only pull data relevant to work planning. Don't surface full email contents — just subjects
and sender/importance. Slack content should be summarized, not quoted at length.
Harvest data is hours/projects only. Keep the plan focused on professional work.

### Plan History & Day Navigation
Plans are automatically archived in the Config tab under keys like `plan_2026-03-04`.
The `doWritePlanJson_()` function auto-archives: when a plan is written, it parses the
plan's date (preferring `meta.date_key` over fragile `meta.date` parsing) and saves a copy
under `plan_YYYY-MM-DD`.

The dashboard supports day navigation via URL parameter: `?page=dashboard&date=2026-03-04`.
Prev/next buttons in the dashboard header let the user browse between archived plan dates.
The "Today" spreadsheet tab always reflects the actual current day's plan — historical
plans are only accessible through the dashboard navigation or Config keys.

When building plans for future days (e.g., tomorrow), archive the current day's plan first,
then write the new plan. Both will be accessible through dashboard navigation.

**Plan immutability rules** (enforced in `doWritePlanJson_()`):
- **Today and future plans are mutable** — can be freely updated and overwritten throughout
  the day. The skill rewrites today's plan on every replan.
- **Past plans are immutable snapshots** — once a plan for a past date has been archived,
  it cannot be overwritten. This preserves the historical record for velocity tracking,
  retrospectives, and day navigation. If a write targets a past date that already has an
  archive entry, the archive is preserved and the write is silently skipped (logged).
- **PlanJSON A1 always shows today** — if a past-date write occurs (e.g., late-night
  reconciliation), PlanJSON A1 is restored to today's plan so the dashboard default view
  remains current.
- **`meta.date_key` is the source of truth** for date archiving. Always include it in
  YYYY-MM-DD format. The fallback (`meta.date` string parsing) is fragile and locale-dependent.

### Date & Timezone Handling
The user is in **US Pacific time**. Be careful with dates:
- System time in Cowork may report UTC — always check and convert to Pacific
- Use explicit date strings (e.g., "2026-03-04") rather than relying on `new Date()` without timezone context
- When the plan says "Thursday, March 5" make sure the underlying date key is `2026-03-05`, not off-by-one

### Source Resilience
Data sources may fail. The skill should degrade gracefully:
- **All sources fail**: Present what you know from the tracking sheet alone
- **Outlook fails**: Use Slack fallback for meeting discovery (NOT Google Calendar — that's personal)
- **Jira fails**: Check GitHub issues as an alternative source of work items
- **Sheets not set up**: Present plan in chat only, remind user to configure persistence
Never let a single source failure prevent the plan from being generated.

### Behavioral Guardrails
- **Build the plan — don't execute it.** Tasks listed in the plan (e.g., "break down OGC-337
  into sub-tasks") are for the user to work on during the day. Do NOT start executing plan items
  during the planning session itself unless explicitly asked.
- **Stay on task.** If the user asks to debug the planner, debug the planner. Don't drift into
  creating Jira tickets, breaking down epics, or other tangential work.
- **Verify before deploying.** When making Code.gs or Dashboard.html changes, run validation
  checks (syntax, brace matching, function references, template variables) before asking the
  user to copy-paste into Apps Script.
- **Past plans are snapshots — never overwrite.** When writing plan JSON, today's and future
  plans can be freely updated. But archived plans for past dates must not be overwritten.
  The server-side `doWritePlanJson_()` enforces this, but the skill should also respect it:
  don't re-generate plans for dates that have already passed unless explicitly asked.
- **The planner spreadsheet is a VIEW, not a source.** Never read yesterday's plan to generate
  carry-over tasks. If a task is still relevant, the source system (Jira, GitHub, etc.) will
  confirm it's still open. Reading the planner's own output as input creates circular reasoning.
- **Cross-verify low-trust signals.** Email notifications (trust ≤ 4) that reference a system
  with an available API (trust ≥ 9) must be checked against that API before surfacing. A "Harvest
  past due" email means nothing if `harvest_weekly_summary` shows hours are logged.
- **Always include `meta.date_key`.** Every plan must have `meta.date_key` in YYYY-MM-DD
  format. This is the reliable key for archiving. Omitting it forces a fragile `Date.parse()`
  fallback that can fail on certain date strings.
- **Use `task` not `title` for task names.** The conversion expects `t.task`. Using `t.title`
  triggers a validation warning and auto-fix, but `task` is the canonical key.
- **Use `est_hours` not `est_minutes`.** Estimates must be in hours (e.g., `1.5`), not minutes.
  The dashboard displays "Xh" format directly from this value.
