# Work Tools

Local MCP servers and Claude skills for work productivity.

## Structure

```
work-tools/
├── mcp-servers/                 # Local MCP servers (no remote deployment)
│   └── work-tools/              # Modular server — Outlook, Harvest, extensible
├── skills/                      # Claude skills (each zippable into .skill)
│   ├── daily-planner/           # AI daily planner
│   ├── weekly-harvest-timesheet/ # Harvest timesheet automation
│   └── deep-research/           # Multi-source research agent
├── setup.sh                     # One-time macOS setup
└── warmup.sh                    # Pre-session browser token capture
```

### MCP Server

**work-tools** — Modular MCP server with drop-in service modules. Currently provides 17 tools for Outlook (email, calendar) and Harvest (time entries, projects). Each service is a self-contained `ToolModule` — adding a new service is one file.

### Skills

Each skill folder is self-contained and can be zipped into a `.skill` file for Claude Desktop import.

## Quick Start

```bash
git clone <repo-url>
cd work-tools
./setup.sh       # one-time
```
