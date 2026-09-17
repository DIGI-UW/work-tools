# Work Tools Index

Shared reference for all skills in the work-tools ecosystem. This file is bundled into each skill's `references/` folder during build.

## Available MCP Tools

### work-tools (local — Outlook + Harvest + Jira)

Registered as `work-tools` via `claude mcp add --scope user`. Provides direct API access to Outlook, Harvest, and Jira.

**Warmup:**
- `warmup` — Capture auth tokens for browser-based services (opens browser briefly). Call if Outlook/Harvest sessions are expired. Jira uses API token auth and doesn't need warmup.

**Outlook (9 tools):**
- `outlook_status` — Check session status
- `outlook_refresh` — Re-authenticate (opens browser)
- `outlook_list_emails` — List recent emails (folder, limit, skip, from_date, to_date)
- `outlook_read_email` — Read full email by ID
- `outlook_search_emails` — Search by keyword
- `outlook_list_events` — Calendar events for a date range (default: next 7 days)
- `outlook_search_events` — Search events by subject/location/organizer
- `outlook_create_draft` — Create a new email draft (to, subject, body, cc, body_type). Saves to Drafts — never sends.
- `outlook_create_reply_draft` — Create a draft reply to an existing email, with the thread quoted (id, comment, reply_all). Saves to Drafts — never sends.

**Harvest (9 tools):**
- `harvest_status` — Check connection status
- `harvest_refresh` — Re-authenticate (opens browser)
- `harvest_list_projects` — List assigned projects
- `harvest_list_tasks` — List tasks for a project
- `harvest_list_time_entries` — Time entries by date range
- `harvest_create_time_entry` — Create entry (project_id, task_id, spent_date, hours OR started_time+ended_time, notes). Pass `started_time`/`ended_time` (HH:MM 24-hour) for exact time-of-day placement; passing only `hours` synthesizes an 8am-onward block.
- `harvest_update_time_entry` — Update entry (entry_id, plus any of: hours, notes, started_time, ended_time, project_id, task_id, spent_date). Updating only `hours` is a silent no-op for Member-role accounts on the Harvest API; always pass started_time+ended_time when changing duration.
- `harvest_delete_time_entry` — Delete entry
- `harvest_weekly_summary` — Hours summary for a week

**Jira (5 tools):**
- `jira_status` — Check Jira connection status
- `jira_search` — Search issues using JQL
- `jira_get_issue` — Get full issue details by key (e.g., OGC-312)
- `jira_my_issues` — Get issues assigned to you (filterable by status)
- `jira_list_projects` — List recent Jira projects

### External MCP Servers

| Server | Key Tools | Notes |
|--------|-----------|-------|
| **GitHub MCP** | `list_pull_requests`, `search_issues`, `pull_request_read` | PR/issue tracking across repos |
| **Atlassian MCP** | `searchJiraIssuesUsingJql`, `getJiraIssue` | Official cloud integration — preferred when available, but unreliable in Desktop/Cowork. Local `jira_*` tools are the fallback. |
| **Slack MCP** | `slack_search_public`, `slack_read_channel` | Channel search and message reading |
| **PubMed MCP** | `search_articles`, `get_article_metadata`, `get_full_text_article` | Biomedical literature |

## Settings

Skills load credentials from a `.env` file in the **working folder** (the folder you
select when starting a Claude session). Always run skills from the same folder so they
can find their settings.

**Daily Planner `.env`:**
```
DAILY_PLANNER_URL=https://script.google.com/macros/s/.../exec
DAILY_PLANNER_TOKEN=your-shared-secret
```

| Variable | Used By | Purpose |
|----------|---------|---------|
| `HARVEST_ACCESS_TOKEN` | work-tools MCP | Harvest Personal Access Token |
| `HARVEST_ACCOUNT_ID` | work-tools MCP | Harvest account ID |
| `JIRA_BASE_URL` | work-tools MCP | Jira Cloud URL (e.g., https://uwdigi.atlassian.net) |
| `JIRA_EMAIL` | work-tools MCP | Jira account email |
| `JIRA_API_TOKEN` / `JIRA_TOKEN` | work-tools MCP | Jira API token |
| `DAILY_PLANNER_URL` | daily-planner skill | Apps Script web app URL |
| `DAILY_PLANNER_TOKEN` | daily-planner skill | Apps Script auth token |
| `OUTLOOK_TIMEZONE` | work-tools MCP | Optional. IANA timezone (e.g. `America/Los_Angeles`) that Outlook tools return calendar/email times in. Defaults to the host's `Intl.DateTimeFormat` timezone. **Calendar event start/end values are NOT UTC — they're in this zone**, so HH:MM substrings can be passed directly to `harvest_create_time_entry`. |

The MCP server loads from `<repo-root>/.env.local` or `~/.work-tools.env`. See AGENTS.md for setup.

## Available Skills

| Skill | Purpose | When to Suggest |
|-------|---------|-----------------|
| **daily-planner** | Synthesizes Jira, Slack, GitHub, Outlook, Harvest into time-blocked daily plans | "plan my day", morning planning, mid-day replan |
| **weekly-harvest-timesheet** | Maps calendar events to Harvest projects, fills timesheet | "fill out harvest", "log my hours", Friday cadence |
| **deep-research** | Multi-source research producing structured reports | "research X", "look into Y", literature reviews |

## Common Patterns

**Error handling for MCP tools:**
- If `outlook_list_events` fails with auth error → try the bundled `outlook_client.py` script (see below)
- If `harvest_*` tools return "not configured" → call `warmup` or check MCP server config
- Harvest V2 API has no submission endpoint — direct users to https://app.harvestapp.com/time to review and submit

**Script execution:**
- Use `${CLAUDE_SKILL_DIR}` to reference bundled scripts (e.g., `python3 "${CLAUDE_SKILL_DIR}/scripts/sheets_helper.py"`)
- This works regardless of the working directory

**Self-contained scripts (no MCP server needed):**
- `scripts/jira_client.py` — Jira REST API v3 client (status, my-issues, search, get-issue, list-projects)
- `scripts/harvest_client.py` — Harvest V2 API client (status, weekly-summary, list-entries, list-projects)
- Both are stdlib-only Python 3 — no pip dependencies. Read env vars from shell or `~/.work-tools.env`.
- Use as fallback when MCP server tools are unavailable:
  ```bash
  python3 "${CLAUDE_SKILL_DIR}/scripts/jira_client.py" my-issues --max 10
  python3 "${CLAUDE_SKILL_DIR}/scripts/harvest_client.py" weekly-summary
  ```

**Bundled Outlook fallback (daily-planner):**
- `scripts/outlook_client.py` — standalone Outlook client (Playwright token capture, Office 365 API). Shares token file `~/.outlook-mcp-token.json` and Chrome profile with the MCP server.
- Usage: `python3 "${CLAUDE_SKILL_DIR}/scripts/outlook_client.py" list-events --start YYYY-MM-DD`, `list-emails --limit 20`
- Use when `outlook_list_events` / `outlook_list_emails` MCP tools fail. Prerequisite: `pip install playwright`.
