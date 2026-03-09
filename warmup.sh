#!/bin/bash
# Captures auth tokens for the work-tools MCP server (Outlook + Harvest).
# Run before each Claude Desktop session.
# Usage: ./warmup.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load Harvest env if saved
[ -f "$SCRIPT_DIR/.env.local" ] && source "$SCRIPT_DIR/.env.local"

cd "$SCRIPT_DIR/mcp-servers/work-tools"
# warmup.ts was removed — warmup is now an MCP tool.
# Start the server and call the warmup tool via Claude, or use this for testing:
echo "Warmup is now an MCP tool. Start Claude and call 'warmup'."
echo "Or start the server directly: node dist/index.js"
