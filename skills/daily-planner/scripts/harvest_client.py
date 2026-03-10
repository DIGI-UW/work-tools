#!/usr/bin/env python3
"""
Standalone Harvest client for the Daily Planner skill.

Self-contained — no MCP server or pip dependencies needed. Uses Harvest V2
API with Personal Access Token (PAT) auth.

Auth: Reads HARVEST_ACCESS_TOKEN and HARVEST_ACCOUNT_ID from environment
variables or ~/.work-tools.env.

Usage (CLI):
    python3 harvest_client.py status
    python3 harvest_client.py weekly-summary [--week-of YYYY-MM-DD]
    python3 harvest_client.py list-entries [--from YYYY-MM-DD] [--to YYYY-MM-DD]
    python3 harvest_client.py list-projects
    python3 harvest_client.py list-tasks --project PROJECT_ID

Usage (Python import):
    from harvest_client import HarvestClient
    harvest = HarvestClient()
    summary = harvest.weekly_summary()
"""

import os
import ssl
import subprocess
import sys
import json
from datetime import date, timedelta
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from typing import Optional


def _ssl_context() -> ssl.SSLContext:
    """Create SSL context, handling macOS Python missing cert bundle."""
    ctx = ssl.create_default_context()
    if ctx.get_ca_certs():
        return ctx
    for path in ["/etc/ssl/cert.pem", "/etc/pki/tls/certs/ca-bundle.crt"]:
        try:
            ctx.load_verify_locations(path)
            return ctx
        except Exception:
            continue
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except ImportError:
        pass
    return ctx


def _load_env_file(path: str) -> dict:
    """Load key=value pairs from a file, ignoring comments and blanks."""
    env = {}
    try:
        with open(os.path.expanduser(path)) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[7:]
                if "=" in line:
                    k, v = line.split("=", 1)
                    v = v.strip().strip('"').strip("'")
                    env[k.strip()] = v
    except FileNotFoundError:
        pass
    return env


def _get_env(key: str) -> str:
    """Get env var, falling back to .env files."""
    val = os.environ.get(key)
    if val:
        return val
    for path in [".env.local", "~/.work-tools.env"]:
        env = _load_env_file(path)
        if key in env:
            return env[key]
    return ""


class HarvestClient:
    """Lightweight Harvest V2 API client."""

    API_BASE = "https://api.harvestapp.com/v2"

    def __init__(
        self,
        access_token: Optional[str] = None,
        account_id: Optional[str] = None,
    ):
        self.access_token = access_token or _get_env("HARVEST_ACCESS_TOKEN")
        self.account_id = account_id or _get_env("HARVEST_ACCOUNT_ID")

    @property
    def configured(self) -> bool:
        return bool(self.access_token and self.account_id)

    def _api(self, path: str, params: Optional[dict] = None) -> dict:
        url = f"{self.API_BASE}{path}"
        if params:
            url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Harvest-Account-Id": self.account_id,
            "Accept": "application/json",
            "User-Agent": "work-tools/1.0 (daily-planner)",
        }
        # Try urllib first; fall back to curl if Cloudflare blocks Python's TLS fingerprint
        try:
            req = Request(url, headers=headers)
            with urlopen(req, context=_ssl_context()) as resp:
                return json.loads(resp.read())
        except HTTPError as e:
            body = e.read()
            if e.code == 403 and b"cloudflare" in (body or b"").lower():
                return self._api_curl(url, headers)
            raise RuntimeError(f"Harvest API {e.code}: {body.decode()[:300]}") from e
        except URLError as e:
            raise RuntimeError(f"Harvest connection failed: {e.reason}") from e

    def _api_curl(self, url: str, headers: dict) -> dict:
        """Fallback HTTP transport using curl (bypasses Cloudflare TLS fingerprinting)."""
        args = ["curl", "-s", "-f", url]
        for k, v in headers.items():
            args.extend(["-H", f"{k}: {v}"])
        proc = subprocess.run(args, capture_output=True, text=True, timeout=15)
        if proc.returncode != 0:
            raise RuntimeError(f"Harvest API (curl): {proc.stderr.strip()[:300]}")
        return json.loads(proc.stdout)

    def status(self) -> dict:
        if not self.configured:
            return {"connected": False, "message": "Not configured. Set HARVEST_ACCESS_TOKEN and HARVEST_ACCOUNT_ID."}
        try:
            me = self._api("/users/me")
            return {"connected": True, "message": f"Connected as {me.get('first_name', '')} {me.get('last_name', '')}"}
        except Exception as e:
            return {"connected": False, "message": f"Auth failed: {e}"}

    def list_projects(self) -> list:
        data = self._api("/users/me/project_assignments")
        results = []
        for pa in data.get("project_assignments", []):
            p = pa.get("project", {})
            c = pa.get("client", {})
            results.append({
                "project_id": p.get("id"),
                "project_name": p.get("name"),
                "project_code": p.get("code"),
                "client_name": c.get("name"),
                "is_active": pa.get("is_active", True),
                "task_assignments": [
                    {"task_id": ta["task"]["id"], "task_name": ta["task"]["name"]}
                    for ta in pa.get("task_assignments", [])
                    if ta.get("is_active", True)
                ],
            })
        return results

    def list_entries(self, from_date: Optional[str] = None, to_date: Optional[str] = None) -> list:
        today = date.today()
        params = {
            "from": from_date or (today - timedelta(days=today.weekday())).isoformat(),
            "to": to_date or today.isoformat(),
        }
        data = self._api("/time_entries", params)
        return [
            {
                "id": e["id"],
                "project": e.get("project", {}).get("name"),
                "project_id": e.get("project", {}).get("id"),
                "task": e.get("task", {}).get("name"),
                "task_id": e.get("task", {}).get("id"),
                "date": e.get("spent_date"),
                "hours": e.get("hours"),
                "notes": e.get("notes"),
                "is_running": e.get("is_running", False),
            }
            for e in data.get("time_entries", [])
        ]

    def weekly_summary(self, week_of: Optional[str] = None) -> dict:
        today = date.today()
        if week_of:
            ref = date.fromisoformat(week_of)
        else:
            ref = today
        monday = ref - timedelta(days=ref.weekday())
        friday = monday + timedelta(days=4)

        entries = self.list_entries(monday.isoformat(), friday.isoformat())
        total = sum(e["hours"] for e in entries)
        by_project: dict = {}
        by_day: dict = {}
        for e in entries:
            proj = e["project"] or "Unknown"
            by_project[proj] = by_project.get(proj, 0) + e["hours"]
            day = e["date"]
            by_day[day] = by_day.get(day, 0) + e["hours"]

        return {
            "week_of": monday.isoformat(),
            "total_hours": round(total, 2),
            "target_hours": 40,
            "remaining": round(max(0, 40 - total), 2),
            "by_project": {k: round(v, 2) for k, v in sorted(by_project.items(), key=lambda x: -x[1])},
            "by_day": {k: round(v, 2) for k, v in sorted(by_day.items())},
            "entry_count": len(entries),
        }


def main():
    if len(sys.argv) < 2:
        print("Usage: harvest_client.py <command> [args]", file=sys.stderr)
        print("Commands: status, weekly-summary, list-entries, list-projects, list-tasks", file=sys.stderr)
        sys.exit(1)

    client = HarvestClient()
    cmd = sys.argv[1]

    def _get_flag(flag: str, default: Optional[str] = None) -> Optional[str]:
        if flag in sys.argv:
            idx = sys.argv.index(flag)
            if idx + 1 < len(sys.argv):
                return sys.argv[idx + 1]
        return default

    try:
        if cmd == "status":
            result = client.status()
        elif cmd == "weekly-summary":
            result = client.weekly_summary(_get_flag("--week-of"))
        elif cmd == "list-entries":
            result = client.list_entries(_get_flag("--from"), _get_flag("--to"))
        elif cmd == "list-projects":
            result = client.list_projects()
        elif cmd == "list-tasks":
            proj_id = _get_flag("--project")
            if not proj_id:
                print("Usage: harvest_client.py list-tasks --project PROJECT_ID", file=sys.stderr); sys.exit(1)
            projects = client.list_projects()
            for p in projects:
                if str(p["project_id"]) == proj_id:
                    result = p["task_assignments"]; break
            else:
                result = {"error": f"Project {proj_id} not found in assignments"}
        else:
            print(f"Unknown command: {cmd}", file=sys.stderr); sys.exit(1)

        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
