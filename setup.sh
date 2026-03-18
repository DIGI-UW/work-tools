#!/bin/bash
# Work Tools — One-time setup for macOS
# Run: ./setup.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIR="$SCRIPT_DIR/mcp-servers/work-tools"
cd "$MCP_DIR"

echo "=== Work Tools Setup ==="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "Node.js not found. Install it from https://nodejs.org (v20+)"
  exit 1
fi
echo "  Node.js $(node --version)"

# Check Python + Playwright (needed by bundled outlook_client.py)
if command -v python3 &>/dev/null; then
  echo "  Python $(python3 --version 2>&1 | awk '{print $2}')"
  if python3 -c "import playwright" 2>/dev/null; then
    echo "  Playwright (Python) installed"
  else
    echo "  Installing Playwright for Python (used by outlook_client.py)..."
    pip3 install playwright 2>&1 | tail -1
    echo "  Playwright (Python) installed"
  fi
else
  echo "  Python 3 not found — outlook_client.py fallback will be unavailable"
fi

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --production 2>&1 | tail -1
fi
echo "  Dependencies installed"

# Build if needed
if [ ! -f "dist/index.js" ]; then
  echo "Building..."
  npx tsc
fi
echo "  Built"

# --- Environment Variables ---
echo ""
echo "--- Environment Variables ---"
echo "The MCP server loads env vars from .env.local (repo root) and ~/.work-tools.env (home dir)."
echo ""

ENV_FILE="$SCRIPT_DIR/.env.local"
ENV_CHANGED=false

# Harvest config — optional PAT, browser auth is the default
echo "--- Harvest Auth ---"
echo "Default: browser sign-in during warmup (no setup needed)."
echo "Alternative: use a Personal Access Token for longer sessions."
echo ""
read -p "Use a Harvest PAT? [y/N]: " USE_PAT

HARVEST_TOKEN=""
HARVEST_ACCOUNT=""
if [[ "$USE_PAT" =~ ^[Yy] ]]; then
  echo "Get your token from: https://id.getharvest.com/developers"
  read -p "  Harvest Access Token: " HARVEST_TOKEN
  read -p "  Harvest Account ID: " HARVEST_ACCOUNT
fi

# Daily Planner config — optional
echo ""
echo "--- Daily Planner (optional) ---"
echo "Apps Script web app for Google Sheets integration."
echo "See: skills/daily-planner/references/setup-guide.md"
echo ""
read -p "Configure Daily Planner? [y/N]: " USE_PLANNER

PLANNER_URL=""
PLANNER_TOKEN=""
if [[ "$USE_PLANNER" =~ ^[Yy] ]]; then
  read -p "  Daily Planner URL: " PLANNER_URL
  read -p "  Daily Planner Token: " PLANNER_TOKEN
fi

# Write .env.local
if [ -n "$HARVEST_TOKEN" ] || [ -n "$PLANNER_URL" ]; then
  : > "$ENV_FILE"  # truncate
  if [ -n "$HARVEST_TOKEN" ] && [ -n "$HARVEST_ACCOUNT" ]; then
    echo "HARVEST_ACCESS_TOKEN=$HARVEST_TOKEN" >> "$ENV_FILE"
    echo "HARVEST_ACCOUNT_ID=$HARVEST_ACCOUNT" >> "$ENV_FILE"
  fi
  if [ -n "$PLANNER_URL" ] && [ -n "$PLANNER_TOKEN" ]; then
    echo "DAILY_PLANNER_URL=$PLANNER_URL" >> "$ENV_FILE"
    echo "DAILY_PLANNER_TOKEN=$PLANNER_TOKEN" >> "$ENV_FILE"
  fi
  echo "  Saved to $ENV_FILE"
  ENV_CHANGED=true
fi

# Offer ~/.work-tools.env symlink
if [ -f "$ENV_FILE" ]; then
  echo ""
  echo "--- Home Directory Fallback ---"
  echo "Symlink ~/.work-tools.env → .env.local so the MCP server can find"
  echo "env vars from any working directory (Cowork, scheduled tasks, etc.)."
  echo ""
  if [ -L "$HOME/.work-tools.env" ]; then
    echo "  ~/.work-tools.env already exists (symlink → $(readlink "$HOME/.work-tools.env"))"
  elif [ -f "$HOME/.work-tools.env" ]; then
    echo "  ~/.work-tools.env already exists (regular file, not overwriting)"
  else
    read -p "Create symlink ~/.work-tools.env → .env.local? [Y/n]: " CREATE_SYMLINK
    if [[ ! "$CREATE_SYMLINK" =~ ^[Nn] ]]; then
      ln -s "$ENV_FILE" "$HOME/.work-tools.env"
      echo "  Created: ~/.work-tools.env → $ENV_FILE"
    fi
  fi
fi

# --- Claude Desktop Config ---
echo ""
echo "--- Claude Desktop Config ---"

CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

MCP_ENTRY=$(cat <<MCPEOF
{
  "command": "node",
  "args": ["$MCP_DIR/dist/index.js"]
}
MCPEOF
)

echo ""
echo "Add this to your Claude Desktop config at:"
echo "  $CONFIG_FILE"
echo ""
echo "Under \"mcpServers\", add:"
echo ""
echo "  \"work-tools\": $MCP_ENTRY"
echo ""

# --- Claude Code / Cowork registration ---
echo "--- Claude Code Registration ---"
if command -v claude &>/dev/null; then
  echo "Registering work-tools MCP server with Claude Code..."
  # No -e flags — MCP server loads its own .env.local and ~/.work-tools.env
  claude mcp add --scope user work-tools -- node "$MCP_DIR/dist/index.js" 2>&1 || true
  echo "  Registered. Verify with: claude mcp list"
else
  echo "  Claude Code CLI not found. Install it to register for Cowork/scheduled tasks."
  echo "  Then run: claude mcp add --scope user work-tools -- node \"$MCP_DIR/dist/index.js\""
fi

# --- GitHub MCP (optional) ---
echo ""
echo "--- GitHub MCP (optional) ---"
echo "Skills use GitHub MCP tools for PR/issue tracking."
echo "To set up, get a GitHub PAT from: https://github.com/settings/tokens"
echo "Then run:"
echo "  claude mcp add --scope user -e GITHUB_PERSONAL_ACCESS_TOKEN=YOUR_PAT github -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server"
echo ""
echo "Or without Docker (download binary from https://github.com/github/github-mcp-server/releases):"
echo "  claude mcp add --scope user -e GITHUB_PERSONAL_ACCESS_TOKEN=YOUR_PAT github -- github-mcp-server stdio"

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Run ./warmup.sh before each Claude Desktop session (browser sign-in)"
echo "  2. With headless auto-refresh, the server can stay alive indefinitely"
echo "  3. For scheduled tasks (Cowork), MCP tools are available automatically"
