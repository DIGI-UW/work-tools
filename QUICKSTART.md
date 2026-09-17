# Quick Start

This repo has two kinds of artifacts that combine differently depending on your environment:

| Artifact | What it is | Location |
|----------|-----------|----------|
| **MCP Server** | Local Node.js process exposing 26 tools (Outlook, Harvest, Jira) over stdio | `mcp-servers/work-tools/` |
| **Skills** | AI playbooks with bundled scripts — tell Claude *when* and *how* to use tools | `skills/` |

Pick the path that matches your setup. Each path builds on the previous one.

---

## Path A: Skills Only (Claude Desktop, no local server)

**Best for:** Quick start, minimal setup. Accepts reduced capability (no Outlook, no Harvest writes).

Skills bundle stdlib-only Python scripts that call Jira and Harvest APIs directly — no MCP server or git repo needed at runtime.

### Steps

1. **Set environment variables** (Jira + Harvest API tokens):

   ```bash
   # In ~/.zshrc or equivalent
   export JIRA_BASE_URL="https://yoursite.atlassian.net"
   export JIRA_EMAIL="you@example.com"
   export JIRA_API_TOKEN="your-token"          # https://id.atlassian.com/manage-profile/security/api-tokens
   export HARVEST_ACCESS_TOKEN="your-token"    # https://id.getharvest.com/developers
   export HARVEST_ACCOUNT_ID="your-id"
   ```

2. **Build `.skill` files:**

   ```bash
   git clone <repo-url> && cd work-tools
   ./build-skills.sh --config=<yourname>       # or just ./build-skills.sh
   ```

3. **Install in Claude Desktop:**
   - Open Claude Desktop → Settings → Skills
   - Import `.skill` files from `skills/built-archive/`

4. **Use it:** Say "plan my day" or "fill out my harvest timesheet."

### What works / what doesn't

| Feature | Status | Why |
|---------|--------|-----|
| Jira queries | ✓ via bundled script | `jira_client.py` (stdlib, no deps) |
| Harvest read (summary, entries, projects) | ✓ via bundled script | `harvest_client.py` (stdlib, no deps) |
| Outlook email/calendar | ✗ | Requires browser auth → needs local MCP server |
| Harvest write (create/update/delete entries) | ✗ | Only available via MCP server |
| GitHub / Slack integration | ✓ if Claude-native MCPs configured | Claude Desktop integrations |
| Daily planner dashboard (Google Sheets) | ✓ | `sheets_helper.py` talks to Apps Script over HTTP |

---

## Path B: Skills + Local MCP Server (Claude Desktop, full power)

**Best for:** Full capability — Outlook calendar, Harvest CRUD, browser-based auth.

### Steps

1. **Build the MCP server:**

   ```bash
   git clone <repo-url> && cd work-tools
   cd mcp-servers/work-tools
   npm install
   npm run build            # tsc → dist/
   ```

2. **Register with Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "work-tools": {
         "command": "node",
         "args": ["/absolute/path/to/work-tools/mcp-servers/work-tools/dist/index.js"]
       }
     }
   }
   ```

3. **Set environment variables** — create `.env.local` at repo root (or `~/.work-tools.env`):

   ```bash
   # Jira (required)
   JIRA_BASE_URL=https://yoursite.atlassian.net
   JIRA_EMAIL=you@example.com
   JIRA_API_TOKEN=your-token

   # Harvest (optional — browser auth is the default alternative)
   HARVEST_ACCESS_TOKEN=your-token
   HARVEST_ACCOUNT_ID=your-id

   # Daily Planner (optional)
   DAILY_PLANNER_URL=https://script.google.com/macros/s/.../exec
   DAILY_PLANNER_TOKEN=your-secret
   ```

4. **Build and install skills:**

   ```bash
   cd /path/to/work-tools
   ./build-skills.sh --config=<yourname>
   ```

   Import `.skill` files from `skills/built-archive/` into Claude Desktop.

5. **Warm up browser auth** (Outlook + Harvest):
   - In Claude Desktop, say "warmup" — this opens a browser briefly to capture tokens.
   - Outlook tokens auto-refresh headlessly for ~15 min using SSO cookies.
   - Harvest tokens last ~8 hours (or use PAT env vars to skip browser auth entirely).

Or run the interactive setup that handles steps 1–4:

```bash
./setup.sh
```

### What works

Everything from Path A, plus:

| Feature | Status | How |
|---------|--------|-----|
| Outlook email + calendar | ✓ | Browser token capture, auto-refresh |
| Harvest create/update/delete entries | ✓ | MCP tools with full CRUD |
| Harvest browser auth (no PAT needed) | ✓ | Playwright captures session token |

---

## Path C: Claude Code / Cowork

**Best for:** Terminal workflows, scheduled automation, dev sessions.

### Steps

1. **Build the MCP server** (same as Path B step 1).

2. **Register via CLI:**

   ```bash
   claude mcp add --scope user work-tools -- node "/path/to/work-tools/mcp-servers/work-tools/dist/index.js"
   ```

3. **Link skills for Claude Code** (symlinks, not zipped archives):

   ```bash
   ./build-skills.sh --symlink
   ```

   This creates `.claude/skills/<skill-name>` → `skills/<skill-name>` symlinks.
   Claude Code reads `SKILL.md` directly from the linked folders.

4. **Environment variables** — same as Path B. The MCP server resolves env vars from:
   1. Shell environment (highest priority)
   2. `<repo-root>/.env.local`
   3. `~/.work-tools.env`

5. **External MCP servers** (optional, for full skill coverage):

   ```bash
   # GitHub
   claude mcp add --scope user -e GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx github -- \
     github-mcp-server stdio

   # Slack, PubMed — use Claude-native integrations
   ```

### Scheduled tasks

Skills support unattended runs (e.g., daily-planner's 5am cron). The MCP server and env vars are available automatically if registered with `--scope user`.

---

## Path D: Cursor / Other MCP-Compatible Environments

**Best for:** Using the MCP tools outside of Claude-native surfaces.

### What transfers

The **MCP server** is environment-agnostic — any tool that speaks [MCP over stdio](https://modelcontextprotocol.io) can use it:

```bash
node /path/to/work-tools/mcp-servers/work-tools/dist/index.js
```

Register it in your environment's MCP configuration (Cursor, Windsurf, etc.) with:
- **Command:** `node`
- **Args:** `["/path/to/mcp-servers/work-tools/dist/index.js"]`

### What doesn't transfer

**Skills** (`.skill` files and `SKILL.md` playbooks) are Claude-specific orchestration. They aren't recognized natively by non-Claude agents. However:

- The `SKILL.md` files are plain markdown — usable as reference docs or system prompts in any agent.
- Bundled Python scripts (`jira_client.py`, `harvest_client.py`, `sheets_helper.py`) work anywhere Python 3 is available.
- The MCP tools themselves are fully usable regardless of whether the skill layer exists.

---

## Personalization

Skills separate workflow logic from personal data:

| File | Purpose | Committed? |
|------|---------|-----------|
| `SKILL.md` | Orchestration playbook | Yes |
| `my-config.example.md` | Template with placeholders | Yes |
| `my-config.<name>.md` | Named config for a teammate | Yes |
| `my-config.md` | Active runtime config | No (gitignored) |

To customize:

```bash
cd skills/daily-planner/references
cp my-config.example.md my-config.<yourname>.md
# Edit with your project IDs, meeting mappings, etc.
git add my-config.<yourname>.md
./build-skills.sh --config=<yourname>
```

---

## Tool Inventory

**MCP Server** (25 tools + 1 shared):

| Module | Tools | Auth |
|--------|-------|------|
| **Shared** | `warmup` | — |
| **Outlook** (11) | `outlook_status`, `outlook_refresh`, `outlook_list_emails`, `outlook_read_email`, `outlook_search_emails`, `outlook_list_events`, `outlook_search_events`, `outlook_create_draft`, `outlook_create_reply_draft`, `outlook_update_draft`, `outlook_delete_draft` | Browser token (auto-refresh) |
| **Harvest** (9) | `harvest_status`, `harvest_refresh`, `harvest_list_projects`, `harvest_list_tasks`, `harvest_list_time_entries`, `harvest_create_time_entry`, `harvest_update_time_entry`, `harvest_delete_time_entry`, `harvest_weekly_summary` | PAT env vars or browser token |
| **Jira** (5) | `jira_status`, `jira_search`, `jira_get_issue`, `jira_my_issues`, `jira_list_projects` | API token (env vars) |

**Skills:**

| Skill | Triggers | Needs MCP Server? |
|-------|----------|-------------------|
| **daily-planner** | "plan my day", morning planning | No (Mode B scripts) / Yes (full) |
| **weekly-harvest-timesheet** | "fill out harvest", "log hours" | Yes (needs Harvest CRUD + Outlook) |
| **deep-research** | "research X", "look into Y" | No (uses web search + optional PubMed) |
