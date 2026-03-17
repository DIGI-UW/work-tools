# Work Tools

Local MCP servers and Claude skills for work productivity.

## Structure

```
work-tools/
├── mcp-servers/                 # Local MCP servers (no remote deployment)
│   └── work-tools/              # Modular server — Outlook, Harvest, Jira
├── skills/                      # Claude skills (each zippable into .skill)
│   ├── daily-planner/           # AI daily planner
│   ├── weekly-harvest-timesheet/ # Harvest timesheet automation
│   └── deep-research/           # Multi-source research agent
├── setup.sh                     # One-time macOS setup
├── build-skills.sh              # Package skills into .skill archives
└── warmup.sh                    # Pre-session browser token capture
```

### MCP Server

**work-tools** — Modular MCP server with drop-in service modules. Provides 22 tools across three modules:

| Module | Tools | Auth |
|--------|-------|------|
| **Outlook** | 7 (email + calendar) | Browser token capture (auto-refresh) |
| **Harvest** | 9 (time entries, projects, CRUD) | PAT env vars or browser token |
| **Jira** | 5 (issues, search, projects) | API token env vars |

Each service is a self-contained `ToolModule` — adding a new one is a single file.

### Skills

Each skill folder contains a `SKILL.md` playbook plus bundled scripts and references. Skills tell Claude *when* and *how* to use MCP tools — the server provides capabilities, skills provide intelligence.

| Skill | What it does | Needs MCP server? |
|-------|-------------|-------------------|
| **daily-planner** | Synthesizes Jira, Slack, GitHub, Outlook, Harvest into time-blocked daily plans | No (has script fallback) |
| **weekly-harvest-timesheet** | Maps calendar events to Harvest projects, fills timesheet | Yes |
| **deep-research** | Multi-source research producing structured reports | No |

## Deployment Paths

There are four ways to use this repo, depending on your environment:

| Path | Environment | What you get |
|------|------------|--------------|
| **A: Skills only** | Claude Desktop | Jira + Harvest read via bundled scripts. No Outlook, no Harvest writes. |
| **B: Skills + MCP server** | Claude Desktop | Full power — all 22 tools, browser auth, Harvest CRUD. |
| **C: Claude Code / Cowork** | Terminal / CLI | Same as B, plus scheduled tasks and symlinked skills. |
| **D: Cursor / other agents** | Any MCP-compatible env | MCP tools work anywhere. Skills are reference docs, not native. |

**See [QUICKSTART.md](QUICKSTART.md) for step-by-step setup instructions for each path.**

## Quick Start

```bash
git clone <repo-url>
cd work-tools
./setup.sh       # interactive — builds server, configures env, registers MCP
```

Or pick a specific path from [QUICKSTART.md](QUICKSTART.md).
