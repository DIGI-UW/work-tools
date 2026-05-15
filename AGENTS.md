# AGENTS.md

Guidance for AI coding agents working on this repository.

## What This Repo Is

Work-tools is a monorepo for **local** work productivity tools used with Claude. It contains two types of artifacts:

| Type | Location | What It Is |
|------|----------|------------|
| **MCP Servers** | `mcp-servers/` | Local Node.js processes that expose tools over stdio. Claude Desktop/Code launches them as child processes. Each service is a self-contained module — drop in a new file, done. |
| **Claude Skills** | `skills/` | Self-contained folders zippable into `.skill` files for Claude Desktop. Each contains a `SKILL.md` (AI playbook) plus bundled scripts and references that Claude orchestrates during execution. |

These are complementary: MCP servers give Claude **capabilities** (read email, log time), skills give Claude **intelligence** (when to read what, how to prioritize, what to output).

## Repo Structure

```
work-tools/
├── mcp-servers/
│   └── work-tools/              # Modular MCP server — each service is a ToolModule
│       ├── src/
│       │   ├── index.ts         # Thin composition — loads modules, starts server
│       │   ├── types.ts         # ToolModule interface
│       │   ├── env.ts           # Shared env loading
│       │   ├── browser-auth.ts  # Shared Playwright token capture
│       │   └── modules/
│       │       ├── outlook.ts   # Outlook email/calendar (7 tools)
│       │       ├── harvest.ts   # Harvest time tracking (9 tools, PAT or browser)
│       │       └── jira.ts      # Jira issue tracking (5 tools, API token)
│       ├── package.json
│       └── tsconfig.json
├── skills/
│   ├── daily-planner/           # AI daily work planner
│   │   ├── SKILL.md             # Orchestration playbook
│   │   ├── references/          # Bundled reference docs (sheet structure, setup, etc.)
│   │   └── scripts/             # Bundled helpers (Apps Script, Python)
│   │       ├── jira_client.py   # Standalone Jira client (stdlib-only, Mode B)
│   │       ├── harvest_client.py # Standalone Harvest client (stdlib-only, Mode B)
│   │       └── test_parity.py   # Parity tests: scripts vs MCP tools
│   ├── weekly-harvest-timesheet/ # Harvest timesheet automation
│   │   ├── SKILL.md             # Semi-supervised timesheet workflow
│   │   └── harvest-timesheet-session-handoff.md  # Inter-session memory
│   └── deep-research/           # Multi-source research agent
│       └── SKILL.md             # Configurable research workflow
├── setup.sh                     # One-time macOS setup (Desktop + Code)
├── warmup.sh                    # Pre-session browser token capture
└── package.json                 # Root workspace config
```

## Build & Run

```bash
# MCP server
cd mcp-servers/work-tools
npm install
npm run build          # tsc → dist/
npm run dev            # tsx (hot reload)
npm start              # node dist/index.js (production)

# From repo root
./setup.sh             # One-time setup (installs deps, builds, configures)
./warmup.sh            # Pre-session token capture
```

## Code Style

- **TypeScript strict mode**, ES2022 target, `NodeNext` module resolution
- Use `.js` extensions in relative imports (required for NodeNext)
- **Zod** for all MCP tool input schemas
- All logs to **stderr** (`process.stderr.write`), never stdout (MCP protocol uses stdout)
- Prefix unused variables with `_`

## MCP Server Patterns

### Authentication

Outlook and Harvest use **browser token capture** via Playwright. Jira uses **API token** auth (no browser):

1. **Outlook**: Launches Chrome, navigates to `outlook.office365.com`, intercepts Bearer token from network traffic. Token lasts ~15 minutes but **auto-refreshes headlessly** using persistent browser profile SSO cookies. Stored at `~/.outlook-mcp-token.json`. Calendar / email date-time values are returned in the host's IANA timezone (or `$OUTLOOK_TIMEZONE` if set) via the `Prefer: outlook.timezone="..."` header — **not UTC**.
2. **Harvest**: Same pattern against `app.harvestapp.com`. Token lasts ~8 hours. Stored at `~/.harvest-mcp-token.json`. Falls back to env vars `HARVEST_ACCESS_TOKEN` + `HARVEST_ACCOUNT_ID` if set.
3. **Jira**: Basic Auth with email + API token (no browser needed). Set `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` (or `JIRA_TOKEN`) env vars. Get a token at: https://id.atlassian.com/manage-profile/security/api-tokens
4. **Shared browser context**: During warmup, Outlook and Harvest share a single Playwright browser context (one Chrome window, two tabs). Jira doesn't use browser auth.
5. **Harvest submit**: The Harvest V2 API has no submission endpoint. Users submit manually via the Harvest web UI after reviewing entries.

### Environment Variables

The MCP server loads env vars at startup with this precedence (first set wins):

1. **Shell environment** — always takes priority
2. **`<repo-root>/.env.local`** — resolved via `__dirname` (works regardless of cwd)
3. **`~/.work-tools.env`** — home-dir fallback (works in scheduled tasks, any context)

See `.env.local.example` for the full list of variables. Run `setup.sh` to configure and optionally symlink `~/.work-tools.env` → `.env.local`.

### Adding a New Service Module

Create `src/modules/<service>.ts` implementing `ToolModule`:
```typescript
import type { ToolModule } from "../types.js";

export const myService: ToolModule = {
  name: "my-service",
  async status() { return "my-service: OK"; },
  async warmup() { /* browser auth if needed */ return "my-service: OK"; },
  register(server) {
    server.tool("my_tool", "Description", { /* zod schema */ }, async (params) => {
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
  },
};
```
Then add it to the `modules` array in `src/index.ts`.

## Skills Inventory

| Skill | Purpose | Local MCP Tools | External MCP Dependencies |
|-------|---------|----------------|--------------------------|
| **daily-planner** | Synthesizes Jira, Slack, GitHub, Outlook, Harvest into time-blocked daily plans with parallel work streams | `outlook_list_events`, `outlook_list_emails`, `harvest_weekly_summary`, `harvest_list_time_entries`, `jira_my_issues`, `jira_search` | GitHub MCP, Slack MCP |
| **weekly-harvest-timesheet** | Semi-supervised Harvest timesheet automation — gathers signals, maps meetings to projects, fills hours | `outlook_list_events`, `outlook_refresh`, `harvest_list_time_entries`, `harvest_create_time_entry`, `jira_my_issues` | GitHub MCP |
| **deep-research** | Configurable multi-source research agent producing structured markdown reports | None | PubMed MCP, Google Drive MCP (optional), Atlassian MCP (optional) |

## Tool Inventory (work-tools MCP server)

**Shared** (1): `warmup`

**Outlook tools** (7):
`outlook_status`, `outlook_refresh`, `outlook_list_emails`, `outlook_read_email`, `outlook_search_emails`, `outlook_list_events`, `outlook_search_events`

**Harvest tools** (9):
`harvest_status`, `harvest_refresh`, `harvest_list_projects`, `harvest_list_tasks`, `harvest_list_time_entries`, `harvest_create_time_entry`, `harvest_update_time_entry`, `harvest_delete_time_entry`, `harvest_weekly_summary`

**Jira tools** (5):
`jira_status`, `jira_search`, `jira_get_issue`, `jira_my_issues`, `jira_list_projects`

## External MCP Dependencies

Skills expect these external MCP servers to be configured:

| MCP Server | Tools Used | Required By | Setup |
|-----------|-----------|-------------|-------|
| **GitHub MCP** (`github`) | `list_pull_requests`, `search_issues`, `pull_request_read`, `issue_read` | daily-planner, weekly-harvest | Works via Claude Code plugins or `claude mcp add --scope user`. Note: Claude Desktop official integration is unreliable. |
| ~~**Atlassian MCP**~~ | ~~`searchJiraIssuesUsingJql`, `getJiraIssue`, etc.~~ | ~~daily-planner, weekly-harvest~~ | **Replaced by local `jira` module** in work-tools MCP server. The Claude-native Atlassian integration was unreliable in Desktop/Cowork. |
| **Slack MCP** | `slack_search_public` | daily-planner | Claude-native integration |
| **PubMed MCP** | `search_articles`, `get_article_metadata`, etc. | deep-research | Claude-native integration |
| **Google Drive MCP** | `google_drive_search` | deep-research (optional) | Not currently configured |

## Skill Patterns

### Deployment Modes

Skills support two tool access modes:

**Mode A: MCP Server (default)** — Full-featured. Requires `git clone` → `npm run build` → `claude mcp add`.
- All 22 tools (Outlook, Harvest, Jira) available
- Supports browser auth (Outlook, Harvest warmup)
- Supports write operations (Harvest time entry CRUD)

**Mode B: Self-Contained Scripts** — No MCP server or git repo needed. Bundled Python scripts (stdlib-only) call APIs directly via bash.
- Currently covers: Jira (read-only) and Harvest (read-only)
- Does NOT cover: Outlook (requires browser auth), Harvest write ops
- Scripts: `scripts/jira_client.py`, `scripts/harvest_client.py`
- Env vars: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `HARVEST_ACCESS_TOKEN`, `HARVEST_ACCOUNT_ID`
- Verify parity: `python3 scripts/test_parity.py` (or `--compare-mcp` to compare against MCP server)

**Tool resolution order** (documented in each SKILL.md):
1. Official Claude MCP integration (Atlassian, GitHub, Slack)
2. Local `work-tools` MCP server tools
3. Bundled Python scripts (self-contained fallback)

### Skill Folder Structure

Each skill in `skills/` is self-contained and zippable into a `.skill` file:

```
skills/<name>/
├── SKILL.md                       # Required. Workflow orchestration instructions
├── references/
│   ├── my-config.md               # Personal config (gitignored on main)
│   ├── my-config.example.md       # Template for new users
│   ├── my-config.<name>.md        # Named configs for teammates
│   └── work-tools-index.md        # Shared MCP tool catalog (copied by build)
└── scripts/                       # Optional. Helpers (Python, Apps Script, shell)

skills/shared/                     # Shared references copied into each skill during build
└── work-tools-index.md            # MCP tool catalog, env vars, available skills

skills/built-archive/              # Built .skill files (zip archives)
└── templates/                     # Template builds (gitignored)
```

### Skill Customization (my-config.md)

Each skill separates **workflow logic** (SKILL.md) from **personal data** (my-config.md). The SKILL.md references config via markdown links like `[references/my-config.md](references/my-config.md#section-name)`.

**Config files per skill:**
- `my-config.md` — active runtime config. **Gitignored** — never committed. Built locally from a named config or copied from the example template.
- `my-config.example.md` — de-identified template with placeholder values and setup instructions. Always committed.
- `my-config.<name>.md` — named configs for teammates (e.g., `my-config.piotr.md`). Committed to the repo.

**How to customize:**
1. Copy the example: `cp my-config.example.md my-config.<yourname>.md`
2. Fill in your personal data (identity, project IDs, meeting mappings, etc.)
3. Commit your named config: `git add my-config.<yourname>.md`
4. Build with it: `./build-skills.sh --config=<yourname>`
5. For local use, the build copies your named config to `my-config.md` automatically

### Building .skill Files

```bash
./build-skills.sh                  # Build with default my-config.md
./build-skills.sh --symlink        # Also create .claude/skills/ symlinks for Claude Code
./build-skills.sh --template       # Build shareable version with placeholder config
./build-skills.sh --config=jan     # Build with my-config.jan.md as the active config
```

The build script copies shared references from `skills/shared/` into each skill's `references/` folder, selects the appropriate config, strips other `my-config.*.md` files, and zips into a `.skill` file.

### Distribution

| Surface | Method |
|---------|--------|
| **Claude Code** | `.claude/skills/` symlinks (created by `--symlink` flag) |
| **Claude Desktop** | Upload `.skill` files from `built-archive/` |
| **Team sharing** | Commit `skills/` source + `built-archive/` to git |
| **New user onboarding** | `cp my-config.example.md my-config.md`, edit, build |

### SKILL.md Anatomy

```markdown
---
name: skill-name
description: >
  When this skill triggers and what it does.
---

# Skill Title

Instructions for Claude: what data to gather, how to process it,
what to output. Reference bundled scripts and MCP tools by name.
```

The SKILL.md is the "brain" — it tells Claude:
- What MCP tools to call and when
- How to run bundled scripts (`scripts/`)
- How to read bundled references (`references/`)
- What to output (JSON, markdown, dashboard data, etc.)

## Development Methodology — Speckit

This project uses **speckit** for feature development. Use `/speckit.*` commands:

| Command | Purpose |
|---------|---------|
| `/speckit.specify` | Create or update a feature spec from a description |
| `/speckit.plan` | Generate a technical implementation plan |
| `/speckit.tasks` | Generate dependency-ordered tasks |
| `/speckit.implement` | Execute tasks from tasks.md |
| `/speckit.clarify` | Identify underspecified areas in the spec |
| `/speckit.analyze` | Cross-artifact consistency check |

### Workflow

1. **Specify**: Describe the feature → spec is generated in `.specify/specs/<name>/spec.md`
2. **Plan**: Spec → implementation plan in `plan.md`
3. **Tasks**: Plan → ordered task list in `tasks.md`
4. **Implement**: Execute tasks, checking them off as done

### Adding a New MCP Server via Speckit

```
/speckit.specify Add a new MCP server for <service> that provides <tools>
```

### Adding a New Skill via Speckit

```
/speckit.specify Add a Claude skill for <workflow> that orchestrates <data sources> into <output>
```

## PR Guidelines

- Branch from `main`, squash merge back
- Prefix commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Verify: `npm run build` passes in all modified mcp-servers

## Active Technologies

**Runtime:** TypeScript 5.8+ / Node.js 20+ (ES2022, NodeNext)

**MCP:** `@modelcontextprotocol/sdk ^1.12.1`, Zod 3

**Browser automation:** Playwright (Chromium, persistent profiles)

**Skill scripts:** Python 3, Google Apps Script
