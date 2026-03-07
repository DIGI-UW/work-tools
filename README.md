# Work Tools

Local MCP servers and Claude skills for work productivity.

## Structure

```
work-tools/
├── mcp-servers/                 # Local MCP servers (no remote deployment)
│   └── outlook-harvest/         # Outlook email/calendar + Harvest time tracking
├── skills/                      # Claude skills (each zippable into .skill)
│   └── daily-planner/           # AI daily planner (Jira, Slack, GitHub, Outlook, Harvest)
├── setup.sh                     # One-time macOS setup
└── warmup.sh                    # Pre-session browser token capture
```

### MCP Servers

**outlook-harvest** — Local MCP server providing 17 tools for Outlook (email, calendar, search) and Harvest (time entries, projects, weekly summaries). Uses browser token capture via Playwright — no Azure admin consent or Harvest developer setup needed.

### Skills

Each skill folder is self-contained and can be zipped into a `.skill` file for Claude Desktop import.

**daily-planner** — AI-powered daily work planner that synthesizes priorities from Jira, Slack, GitHub, Outlook, and Harvest into time-blocked daily plans.

## Quick Start

```bash
git clone https://github.com/pmanko/work-tools.git
cd work-tools
./setup.sh       # one-time
./warmup.sh      # before each session
```
