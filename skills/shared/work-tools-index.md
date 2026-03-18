# Work Tools Index

Shared reference for all skills in the work-tools ecosystem. This file is bundled into each skill's `references/` folder during build.

## Available MCP Tools

### work-tools (local — Outlook + Harvest)

Registered as `work-tools` via `claude mcp add --scope user`. Provides direct API access to Outlook and Harvest.

**Warmup:**
- `warmup` — Capture auth tokens for both services (opens browser briefly). Call if sessions are expired.

**Outlook (7 tools):**
- `outlook_status` — Check session status
- `outlook_refresh` — Re-authenticate (opens browser)
- `outlook_list_emails` — List recent emails (folder, limit)
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

### External MCP Servers

| Server | Key Tools | Notes |
|--------|-----------|-------|
| **GitHub MCP** | `list_pull_requests`, `search_issues`, `pull_request_read` | PR/issue tracking across repos |
| **Atlassian MCP** | `searchJiraIssuesUsingJql`, `getJiraIssue` | Jira issue queries |
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

**MCP server settings** (if using work-tools MCP): The MCP server has its own config at
`<repo-root>/.env.local` or `~/.work-tools.env`. See AGENTS.md for MCP-specific setup.

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

**Bundled Outlook fallback (daily-planner):**
- `outlook_client.py` — standalone Outlook client that captures auth tokens via Playwright and calls the Office 365 API directly. No MCP server dependency.
- Shares the same token file (`~/.outlook-mcp-token.json`) and Chrome profile (`~/.work-mcp-profile`) as the MCP server — tokens captured by either path are interchangeable.
- Usage: `python3 "${CLAUDE_SKILL_DIR}/scripts/outlook_client.py" list-events --start YYYY-MM-DD --end YYYY-MM-DD`
- Usage: `python3 "${CLAUDE_SKILL_DIR}/scripts/outlook_client.py" list-emails --limit 20 --from-date YYYY-MM-DD`
- Use as Tier 2 fallback when `outlook_list_events` / `outlook_list_emails` MCP tools fail.
- Prerequisite: `pip install playwright` (browser binaries shared with Node Playwright)
