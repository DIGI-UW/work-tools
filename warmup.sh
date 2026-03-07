#!/bin/bash
# Captures auth tokens for the work-tools MCP server (Outlook + Harvest).
# Run before each Claude Desktop session.
# Usage: ./warmup.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load Harvest env if saved
[ -f "$SCRIPT_DIR/.env.local" ] && source "$SCRIPT_DIR/.env.local"

cd "$SCRIPT_DIR/mcp-servers/outlook-harvest"
node dist/warmup.js
