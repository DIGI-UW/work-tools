# CLAUDE.md

Claude Code-specific guidance. **See [AGENTS.md](AGENTS.md) for shared project conventions.**

**Development methodology:** speckit-based — use `/speckit.*` commands for feature workflows.

## Claude-Specific

- MCP servers run locally via stdio — no remote deployment, no auth tokens to configure
- Skills are zipped into `.skill` files for Claude Desktop import
- When committing, always use `git -c commit.gpgsign=false commit` (GPG pinentry doesn't work in Claude Code's terminal)
- Always push after committing on a PR branch
