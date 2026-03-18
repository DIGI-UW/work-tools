#!/usr/bin/env python3
"""
Parity tests: verify bundled Python scripts return equivalent data to MCP tools.

Runs each bundled client command and compares key fields against the MCP tool
output. Requires env vars to be set and (for MCP comparison) the work-tools
MCP server to be built.

Usage:
    python3 test_parity.py                    # Test scripts only (no MCP comparison)
    python3 test_parity.py --compare-mcp      # Also compare against MCP tool output

The --compare-mcp mode starts the MCP server, sends tool calls via stdio,
and compares the results field-by-field against the Python script output.
"""

import json
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
REPO_ROOT = SCRIPTS_DIR.parent.parent.parent
MCP_DIST = REPO_ROOT / "mcp-servers" / "work-tools" / "dist" / "index.js"

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
results = []


def run_script(name: str, *args: str) -> dict:
    """Run a bundled Python script and return parsed JSON output."""
    script = SCRIPTS_DIR / name
    proc = subprocess.run(
        [sys.executable, str(script), *args],
        capture_output=True, text=True, timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"{name} failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    """Call an MCP tool via the stdio server and return the result."""
    msgs = [
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"}
        }}),
        json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {
            "name": tool_name, "arguments": arguments
        }}),
    ]
    proc = subprocess.run(
        ["node", str(MCP_DIST)],
        input="\n".join(msgs) + "\n",
        capture_output=True, text=True, timeout=15,
        cwd=str(REPO_ROOT),
    )
    # Parse the tool call response (id: 2)
    for line in proc.stdout.strip().split("\n"):
        try:
            resp = json.loads(line)
            if resp.get("id") == 2:
                text = resp["result"]["content"][0]["text"]
                return json.loads(text)
        except (json.JSONDecodeError, KeyError):
            continue
    raise RuntimeError(f"No response for {tool_name}. stderr: {proc.stderr[:200]}")


def report(test_name: str, passed: bool, detail: str = ""):
    status = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
    results.append(passed)
    print(f"  {status}  {test_name}")
    if detail and not passed:
        print(f"         {detail}")


# ── Jira script tests ──────────────────────────────────────

def test_jira_status():
    data = run_script("jira_client.py", "status")
    report("jira status", data.get("connected") is True or "not configured" in data.get("message", "").lower(),
           f"Got: {data}")

def test_jira_my_issues():
    data = run_script("jira_client.py", "my-issues", "--max", "3")
    report("jira my-issues has issues key", "issues" in data, f"Keys: {list(data.keys())}")
    issues = data.get("issues", [])
    if issues:
        i = issues[0]
        has_fields = all(k in i for k in ["key", "summary", "status", "priority", "link", "overdue"])
        report("jira issue has expected fields", has_fields, f"Keys: {list(i.keys())}")
        report("jira issue link is valid URL", i.get("link", "").startswith("https://"),
               f"Link: {i.get('link')}")
    else:
        report("jira my-issues (no issues to validate fields)", True, "0 issues returned — structure OK")

def test_jira_list_projects():
    data = run_script("jira_client.py", "list-projects")
    report("jira list-projects returns data", len(data) > 0, f"Got {len(data)} projects")
    if data:
        has_fields = all(k in data[0] for k in ["id", "key", "name"])
        report("jira project has expected fields", has_fields, f"Keys: {list(data[0].keys())}")

def test_jira_search():
    data = run_script("jira_client.py", "search",
                      "assignee = currentUser() AND status != Done ORDER BY updated DESC", "--max", "2")
    report("jira search has expected keys", all(k in data for k in ["total", "issues"]),
           f"Keys: {list(data.keys())}")


# ── Harvest script tests ───────────────────────────────────

def test_harvest_status():
    data = run_script("harvest_client.py", "status")
    report("harvest status", data.get("connected") is True or "not configured" in data.get("message", "").lower(),
           f"Got: {data}")

def test_harvest_list_projects():
    data = run_script("harvest_client.py", "list-projects")
    report("harvest list-projects returns data", len(data) > 0, f"Got {len(data)} projects")
    if data:
        has_fields = all(k in data[0] for k in ["project_id", "project_name", "client_name"])
        report("harvest project has expected fields", has_fields, f"Keys: {list(data[0].keys())}")

def test_harvest_weekly_summary():
    data = run_script("harvest_client.py", "weekly-summary")
    report("harvest weekly-summary has expected fields",
           all(k in data for k in ["week_of", "total_hours", "by_project"]),
           f"Keys: {list(data.keys())}")


# ── MCP parity tests ──────────────────────────────────────

def test_jira_parity():
    print(f"\n{YELLOW}── MCP Parity: Jira ──{RESET}")
    script_data = run_script("jira_client.py", "my-issues", "--max", "5")
    mcp_data = call_mcp_tool("jira_my_issues", {"max_results": 5})

    script_keys = {i["key"] for i in script_data.get("issues", [])}
    mcp_keys = {i["key"] for i in mcp_data.get("issues", [])}
    report("jira parity: same issue keys", script_keys == mcp_keys,
           f"Script: {sorted(script_keys)}, MCP: {sorted(mcp_keys)}")

    if script_data.get("issues") and mcp_data.get("issues"):
        si = script_data["issues"][0]
        mi = next((i for i in mcp_data["issues"] if i["key"] == si["key"]), None)
        if mi:
            report("jira parity: status matches", si["status"] == mi["status"],
                   f"Script: {si['status']}, MCP: {mi['status']}")
            report("jira parity: priority matches", si["priority"] == mi["priority"],
                   f"Script: {si['priority']}, MCP: {mi['priority']}")
            # Script has extra fields (link, overdue) that MCP doesn't
            report("jira parity: script has link", bool(si.get("link")), f"Link: {si.get('link')}")
            report("jira parity: script has overdue flag", "overdue" in si, f"Keys: {list(si.keys())}")

def test_harvest_parity():
    print(f"\n{YELLOW}── MCP Parity: Harvest ──{RESET}")
    script_data = run_script("harvest_client.py", "list-projects")
    mcp_data = call_mcp_tool("harvest_list_projects", {})

    # Script uses "project_id", MCP uses "id" — compare by the available key
    script_ids = {p["project_id"] for p in script_data}
    mcp_ids = {p.get("project_id") or p.get("id") for p in mcp_data}
    report("harvest parity: same project IDs", script_ids == mcp_ids,
           f"Script: {sorted(script_ids)}, MCP: {sorted(mcp_ids)}")


# ── Main ───────────────────────────────────────────────────

def run_test(fn):
    """Run a test function, catching exceptions so the suite continues."""
    try:
        fn()
    except Exception as e:
        report(fn.__name__, False, str(e))


def main():
    compare_mcp = "--compare-mcp" in sys.argv

    print(f"\n{YELLOW}── Jira Script Tests ──{RESET}")
    run_test(test_jira_status)
    run_test(test_jira_my_issues)
    run_test(test_jira_list_projects)
    run_test(test_jira_search)

    print(f"\n{YELLOW}── Harvest Script Tests ──{RESET}")
    run_test(test_harvest_status)
    run_test(test_harvest_list_projects)
    run_test(test_harvest_weekly_summary)

    if compare_mcp:
        if not MCP_DIST.exists():
            print(f"\n{RED}MCP server not built. Run: cd mcp-servers/work-tools && npm run build{RESET}")
            sys.exit(1)
        run_test(test_jira_parity)
        run_test(test_harvest_parity)

    passed = sum(1 for r in results if r)
    failed = sum(1 for r in results if not r)
    print(f"\n{'─' * 40}")
    print(f"  {GREEN}{passed} passed{RESET}, {RED + str(failed) + ' failed' + RESET if failed else '0 failed'}")
    print()
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
