# Work Tools Index

Shared reference for all skills in the work-tools ecosystem. This file is bundled into each skill's `references/` folder during build.

## Available MCP Tools

### work-tools (local — Outlook + Harvest + Jira)

Registered as `work-tools` via `claude mcp add --scope user`. Provides direct API access to Outlook, Harvest, and Jira.

**Warmup:**
- `warmup` — Capture auth tokens for browser-based services (opens browser briefly). Call if Outlook/Harvest sessions are expired. Jira uses API token auth and doesn't need warmup.

**Outlook (7 tools):**
- `outlook_status` — Check session status
- `outlook_refresh` — Re-authenticate (opens browser)
- `outlook_list_emails` — List recent emails (folder, limit, skip, from_date, to_date)
- `outlook_read_email` — Read full email by ID
- `outlook_search_emails` — Search by keyword
- `outlook_list_events` — Calendar events for a date range (default: next 7 days)
- `outlook_search_events` — Search events by subject/location/organizer

**Harvest (9 tools):**
- `harvest_status` — Check connection status
- `harvest_refresh` — Re-authenticate (opens browser)
- `harvest_list_projects` — List assigned projects
- `harvest_list_tasks` — List tasks for a project
- `harvest_list_time_entries` — Time entries by date range
- `harvest_create_time_entry` — Create entry (project_id, task_id, spent_date, hours, notes)
- `harvest_update_time_entry` — Update entry (entry_id, hours, notes)
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

## Environment Variables

The work-tools MCP server loads env vars at startup with this precedence (first set wins):

1. **Shell environment** — always takes priority
2. **`<repo-root>/.env.local`** — resolved from the MCP server's install path
3. **`~/.work-tools.env`** — home-dir fallback (works from any working directory)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `HARVEST_ACCESS_TOKEN` | work-tools MCP | Harvest Personal Access Token |
| `HARVEST_ACCOUNT_ID` | work-tools MCP | Harvest account ID |
| `JIRA_BASE_URL` | work-tools MCP | Jira Cloud URL (e.g., https://uwdigi.atlassian.net) |
| `JIRA_EMAIL` | work-tools MCP | Jira account email |
| `JIRA_API_TOKEN` / `JIRA_TOKEN` | work-tools MCP | Jira API token |
| `DAILY_PLANNER_URL` | daily-planner skill | Apps Script web app URL |
| `DAILY_PLANNER_TOKEN` | daily-planner skill | Apps Script auth token |

## Available Skills

| Skill | Purpose | When to Suggest |
|-------|---------|-----------------|
| **daily-planner** | Synthesizes Jira, Slack, GitHub, Outlook, Harvest into time-blocked daily plans | "plan my day", morning planning, mid-day replan |
| **weekly-harvest-timesheet** | Maps calendar events to Harvest projects, fills timesheet | "fill out harvest", "log my hours", Friday cadence |
| **deep-research** | Multi-source research producing structured reports | "research X", "look into Y", literature reviews |

## Common Patterns

**Error handling for MCP tools:**
- If `outlook_list_events` fails with auth error → call `warmup` or `outlook_refresh`, then retry
- If `harvest_*` tools return "not configured" → check env vars or call `warmup`
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
