#!/usr/bin/env python3
"""
Standalone Jira client for the Daily Planner skill.

Self-contained — no MCP server or pip dependencies needed. Uses Jira Cloud
REST API v3 with Basic Auth (email + API token).

Auth: Reads JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (or JIRA_TOKEN) from
environment variables or ~/.work-tools.env.

Usage (CLI):
    python3 jira_client.py status
    python3 jira_client.py my-issues [--status STATUS] [--max N]
    python3 jira_client.py search "JQL query" [--max N]
    python3 jira_client.py get-issue OGC-312
    python3 jira_client.py list-projects

Usage (Python import):
    from jira_client import JiraClient
    jira = JiraClient()
    issues = jira.my_issues(max_results=10)
"""

import os
import ssl
import sys
import json
import base64
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from urllib.error import HTTPError, URLError
from typing import Optional


def _ssl_context() -> ssl.SSLContext:
    """Create SSL context, handling macOS Python missing cert bundle."""
    ctx = ssl.create_default_context()
    if ctx.get_ca_certs():
        return ctx
    # macOS Python.org installer ships without root CA bundle — try common paths
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


def _get_env(key: str, *fallback_keys: str) -> str:
    """Get env var, checking fallback keys and ~/.work-tools.env."""
    for k in (key, *fallback_keys):
        val = os.environ.get(k)
        if val:
            return val
    # Try .env files
    for path in [".env.local", "~/.work-tools.env"]:
        env = _load_env_file(path)
        for k in (key, *fallback_keys):
            if k in env:
                return env[k]
    return ""


class JiraClient:
    """Lightweight Jira Cloud REST API v3 client."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        email: Optional[str] = None,
        token: Optional[str] = None,
    ):
        self.base_url = (base_url or _get_env("JIRA_BASE_URL")).rstrip("/")
        self.email = email or _get_env("JIRA_EMAIL")
        self.token = token or _get_env("JIRA_API_TOKEN", "JIRA_TOKEN")

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.email and self.token)

    def _auth_header(self) -> str:
        creds = base64.b64encode(f"{self.email}:{self.token}".encode()).decode()
        return f"Basic {creds}"

    def _api(self, path: str, params: Optional[dict] = None) -> dict:
        url = f"{self.base_url}/rest/api/3{path}"
        if params:
            url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
        req = Request(url, headers={
            "Authorization": self._auth_header(),
            "Accept": "application/json",
        })
        try:
            with urlopen(req, context=_ssl_context()) as resp:
                return json.loads(resp.read())
        except HTTPError as e:
            body = e.read().decode()[:300]
            raise RuntimeError(f"Jira API {e.code}: {body}") from e
        except URLError as e:
            raise RuntimeError(f"Jira connection failed: {e.reason}") from e

    def _format_issue(self, issue: dict) -> dict:
        f = issue.get("fields", {})
        duedate = f.get("duedate")
        overdue = False
        if duedate and f.get("status", {}).get("name", "").lower() != "done":
            from datetime import date as dt_date
            try:
                overdue = dt_date.fromisoformat(duedate) < dt_date.today()
            except ValueError:
                pass
        return {
            "key": issue["key"],
            "summary": f.get("summary", ""),
            "status": (f.get("status") or {}).get("name"),
            "priority": (f.get("priority") or {}).get("name"),
            "assignee": (f.get("assignee") or {}).get("displayName"),
            "type": (f.get("issuetype") or {}).get("name"),
            "project": (f.get("project") or {}).get("key"),
            "created": f.get("created"),
            "updated": f.get("updated"),
            "duedate": duedate,
            "labels": f.get("labels", []),
            "link": f"{self.base_url}/browse/{issue['key']}",
            "overdue": overdue,
        }

    def status(self) -> dict:
        if not self.configured:
            return {"connected": False, "message": "Not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN."}
        try:
            me = self._api("/myself")
            return {"connected": True, "message": f"Connected as {me.get('displayName', me.get('emailAddress', 'unknown'))}"}
        except Exception as e:
            return {"connected": False, "message": f"Auth failed: {e}"}

    def search(self, jql: str, max_results: int = 50) -> dict:
        fields = "summary,status,priority,assignee,issuetype,project,created,updated,duedate,labels"
        data = self._api("/search/jql", {"jql": jql, "maxResults": str(max_results), "fields": fields})
        return {"total": data.get("total", 0), "issues": [self._format_issue(i) for i in data.get("issues", [])]}

    def my_issues(self, status_filter: Optional[str] = None, max_results: int = 30) -> dict:
        jql = "assignee = currentUser()"
        if status_filter:
            jql += f' AND status = "{status_filter}"'
        else:
            jql += " AND status != Done"
        jql += " ORDER BY updated DESC"
        return self.search(jql, max_results)

    def get_issue(self, issue_key: str) -> dict:
        fields = "summary,status,priority,assignee,issuetype,project,created,updated,duedate,description,labels"
        data = self._api(f"/issue/{quote(issue_key)}", {"fields": fields})
        result = self._format_issue(data)
        result["description"] = data.get("fields", {}).get("description")
        return result

    def list_projects(self) -> list:
        data = self._api("/project", {"recent": "20"})
        return [{"id": p["id"], "key": p["key"], "name": p["name"], "type": p.get("projectTypeKey")} for p in data]


def main():
    if len(sys.argv) < 2:
        print("Usage: jira_client.py <command> [args]", file=sys.stderr)
        print("Commands: status, my-issues, search, get-issue, list-projects", file=sys.stderr)
        sys.exit(1)

    client = JiraClient()
    cmd = sys.argv[1]

    try:
        if cmd == "status":
            result = client.status()
        elif cmd == "my-issues":
            status_filter = None
            max_results = 30
            i = 2
            while i < len(sys.argv):
                if sys.argv[i] == "--status" and i + 1 < len(sys.argv):
                    status_filter = sys.argv[i + 1]; i += 2
                elif sys.argv[i] == "--max" and i + 1 < len(sys.argv):
                    max_results = int(sys.argv[i + 1]); i += 2
                else:
                    i += 1
            result = client.my_issues(status_filter, max_results)
        elif cmd == "search":
            if len(sys.argv) < 3:
                print("Usage: jira_client.py search \"JQL query\" [--max N]", file=sys.stderr); sys.exit(1)
            jql = sys.argv[2]
            max_results = 50
            if "--max" in sys.argv:
                idx = sys.argv.index("--max")
                if idx + 1 < len(sys.argv):
                    max_results = int(sys.argv[idx + 1])
            result = client.search(jql, max_results)
        elif cmd == "get-issue":
            if len(sys.argv) < 3:
                print("Usage: jira_client.py get-issue ISSUE-KEY", file=sys.stderr); sys.exit(1)
            result = client.get_issue(sys.argv[2])
        elif cmd == "list-projects":
            result = client.list_projects()
        else:
            print(f"Unknown command: {cmd}", file=sys.stderr); sys.exit(1)

        print(json.dumps(result, indent=2, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
