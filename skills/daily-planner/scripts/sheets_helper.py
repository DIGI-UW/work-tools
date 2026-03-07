#!/usr/bin/env python3
"""
Google Sheets helper for the Daily Planner skill.

Talks to the Apps Script web app via HTTP — NO service account, NO gspread needed.
Apps Script has native permissions on its bound spreadsheet.

Authentication: Every API call includes a shared secret token that must match the
planner_token value in the Config tab. The dashboard HTML is served without auth.

Setup (see references/setup-guide.md for full walkthrough):
1. Create a blank Google Sheet → Extensions → Apps Script
2. Add Code.gs + Dashboard.html from this skill's scripts/appscript/ folder
3. Run doGet (auto-creates all tabs and formatting)
4. Deploy as Web App → copy the URL
5. Set DAILY_PLANNER_URL and DAILY_PLANNER_TOKEN env vars

Usage:
    from sheets_helper import DailyPlannerSheets

    sheets = DailyPlannerSheets()  # reads DAILY_PLANNER_URL env var
    sheets.initialize()            # creates all tabs, headers, formatting

    sheets.save_today_plan(tasks)
    sheets.write_plan_json(plan_data)

    plan = sheets.get_today_plan()
    config = sheets.get_config()
"""

import os
import json
import sys
from datetime import date, datetime, timedelta
from typing import Optional
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError


class DailyPlannerSheets:
    """Interface to the Daily Planner Google Sheets via Apps Script web app."""

    def __init__(self, webapp_url: Optional[str] = None, token: Optional[str] = None):
        """
        Args:
            webapp_url: The deployed Apps Script web app URL.
                Falls back to DAILY_PLANNER_URL env var, then .env file.
            token: Shared secret for API auth.
                Falls back to DAILY_PLANNER_TOKEN env var, then .env file.
        """
        # Load .env file if env vars are not already set (supports Cowork sandboxed VM)
        if not os.environ.get("DAILY_PLANNER_URL"):
            self._load_dotenv()

        self.url = webapp_url or os.environ.get("DAILY_PLANNER_URL", "")
        if not self.url:
            raise ValueError(
                "No Apps Script URL provided. Set DAILY_PLANNER_URL env var, "
                "create a .env file, or pass webapp_url.\n"
                "See the setup guide for deployment instructions."
            )
        # Strip trailing slash
        self.url = self.url.rstrip("/")

        self.token = token or os.environ.get("DAILY_PLANNER_TOKEN", "")

    @staticmethod
    def _load_dotenv():
        """Load KEY=VALUE pairs from .env file into os.environ.

        Searches these paths in order (first found wins):
        1. .env in current working directory
        2. .env in any mounted workspace folder (~/mnt/*/) — Cowork persistent storage
        3. .env in skill directory (next to scripts/)
        4. ~/.daily-planner.env

        Only sets vars that are not already in the environment.
        Supports bare values and single/double-quoted values.
        Lines starting with # are ignored.
        """
        # Detect mounted workspace folders (Cowork convention: ~/mnt/<FolderName>/)
        # In the Cowork VM, the user's selected folder is mounted under ~/mnt/ and
        # persists between sessions — unlike CWD or home dir which reset each time.
        mnt_candidates = []
        mnt_base = os.path.expanduser("~/mnt")
        if os.path.isdir(mnt_base):
            for entry in sorted(os.listdir(mnt_base)):
                candidate = os.path.join(mnt_base, entry, ".env")
                if os.path.isfile(candidate):
                    mnt_candidates.append(candidate)

        candidates = [
            os.path.join(os.getcwd(), ".env"),
            *mnt_candidates,
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
            os.path.expanduser("~/.daily-planner.env"),
        ]
        for path in candidates:
            if os.path.isfile(path):
                with open(path) as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" not in line:
                            continue
                        key, _, value = line.partition("=")
                        key = key.strip()
                        value = value.strip()
                        # Strip surrounding quotes
                        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                            value = value[1:-1]
                        if key and key not in os.environ:
                            os.environ[key] = value
                break  # stop after first .env file found

    # ── HTTP helpers ──────────────────────────────────────────

    def _require_token(self):
        """Raise if token is not set (all methods except initialize need it)."""
        if not self.token:
            raise ValueError(
                "No API token set. Set DAILY_PLANNER_TOKEN env var or pass token.\n"
                "This must match the planner_token value in your Config tab.\n"
                "See references/setup-guide.md Part 3 for token setup."
            )

    def _get(self, page: str) -> dict:
        """GET request to the Apps Script web app."""
        self._require_token()
        url = f"{self.url}?page={page}&token={self.token}"
        try:
            req = Request(url, method="GET")
            # Apps Script redirects — urllib follows redirects by default
            resp = urlopen(req, timeout=30)
            return json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace") if e.fp else ""
            raise ConnectionError(f"GET {page} failed ({e.code}): {body[:300]}")
        except URLError as e:
            raise ConnectionError(f"GET {page} failed: {e.reason}")

    def _post(self, payload: dict) -> dict:
        """POST request to the Apps Script web app."""
        if payload.get("action") != "init":
            self._require_token()
        payload["token"] = self.token  # init sends empty string, server ignores it
        data = json.dumps(payload).encode("utf-8")
        try:
            req = Request(self.url, data=data, method="POST")
            req.add_header("Content-Type", "application/json")
            resp = urlopen(req, timeout=60)
            return json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace") if e.fp else ""
            raise ConnectionError(f"POST {payload.get('action')} failed ({e.code}): {body[:300]}")
        except URLError as e:
            raise ConnectionError(f"POST {payload.get('action')} failed: {e.reason}")

    # ── Initialization ────────────────────────────────────────

    def initialize(self) -> dict:
        """
        Initialize the spreadsheet from a blank sheet.

        Creates all 6 tabs with headers, formatting, column widths,
        default config, sample recurring tasks, and conditional formatting.
        Safe to call repeatedly — only creates what's missing.
        """
        result = self._post({"action": "init"})
        if result.get("ok"):
            print(f"  {result.get('message', 'Initialized')}")
            if result.get("spreadsheet_url"):
                print(f"  Spreadsheet: {result['spreadsheet_url']}")
        else:
            print(f"  Init failed: {result.get('error')}")
        return result

    # ── Today Tab ─────────────────────────────────────────────

    def save_today_plan(self, tasks: list[dict]) -> int:
        """
        Write today's plan to the Today tab. Clears existing data first.

        tasks: list of dicts with keys: task, priority, est_hours, type,
               stream, time_block, source, source_link, status, notes, actual_hours
        """
        result = self._post({"action": "save_today", "tasks": tasks})
        if not result.get("ok"):
            raise RuntimeError(f"save_today failed: {result.get('error')}")
        return result.get("count", 0)

    def get_today_plan(self) -> list[dict]:
        """Read the current Today tab as a list of task dicts."""
        result = self._get("today")
        return result.get("tasks", [])

    def update_task_status(self, task_title: str, status: str):
        """Update a specific task's status in the Today tab."""
        result = self._post({
            "action": "update_status",
            "task_title": task_title,
            "status": status,
        })
        if not result.get("ok"):
            raise RuntimeError(f"update_status failed: {result.get('error')}")

    # ── History Tab ───────────────────────────────────────────

    def archive_day(self, plan_date: str, tasks: list[dict]) -> int:
        """Append a day's tasks to the History tab."""
        result = self._post({
            "action": "archive_day",
            "date": plan_date,
            "tasks": tasks,
        })
        if not result.get("ok"):
            raise RuntimeError(f"archive_day failed: {result.get('error')}")
        return result.get("count", 0)

    def get_history(self, days: int = 7) -> dict:
        """
        Read recent history from the History tab.

        Args:
            days: Number of days to look back (default 7).

        Returns:
            dict with keys:
                tasks: list of task dicts (most recent first)
                dates: list of unique date strings (most recent first)
                days_queried: the days parameter used
        """
        self._require_token()
        url = f"{self.url}?page=history&days={days}&token={self.token}"
        try:
            req = Request(url, method="GET")
            resp = urlopen(req, timeout=30)
            result = json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace") if e.fp else ""
            raise ConnectionError(f"GET history failed ({e.code}): {body[:300]}")
        except URLError as e:
            raise ConnectionError(f"GET history failed: {e.reason}")

        if not result.get("ok"):
            raise RuntimeError(f"get_history failed: {result.get('error')}")
        return result

    # ── Recurring Tab ─────────────────────────────────────────

    def get_recurring_tasks(self) -> list[dict]:
        """Get all recurring tasks."""
        result = self._get("recurring")
        return result.get("tasks", [])

    def get_active_recurring_tasks(self) -> list[dict]:
        """Get only active recurring tasks."""
        tasks = self.get_recurring_tasks()
        return [t for t in tasks if str(t.get("Active", "")).upper() == "TRUE"]

    def get_due_recurring_tasks(self, reference_date: date = None) -> list[dict]:
        """Get recurring tasks that are due on or before the reference date."""
        if reference_date is None:
            reference_date = date.today()

        tasks = self.get_active_recurring_tasks()
        due = []

        for task in tasks:
            next_due_str = task.get("Next Due", "")
            if not next_due_str:
                due.append(task)
                continue

            try:
                next_due = datetime.strptime(str(next_due_str), "%Y-%m-%d").date()
                if next_due <= reference_date + timedelta(days=3):
                    task["_overdue_days"] = (reference_date - next_due).days
                    task["_urgency"] = "overdue" if next_due <= reference_date else "upcoming"
                    due.append(task)
            except (ValueError, TypeError):
                due.append(task)

        return due

    def update_recurring_task(self, task_name: str, updates: dict):
        """Update fields on a recurring task by name."""
        result = self._post({
            "action": "update_recurring",
            "task_name": task_name,
            "updates": updates,
        })
        if not result.get("ok"):
            raise RuntimeError(f"update_recurring failed: {result.get('error')}")

    # ── Velocity Tab ──────────────────────────────────────────

    def get_velocity(self) -> list[dict]:
        """Get all velocity entries for estimation calibration."""
        result = self._get("velocity")
        return result.get("entries", [])

    def log_velocity(self, data: dict):
        """Append a day's velocity metrics."""
        result = self._post({"action": "log_velocity", "data": data})
        if not result.get("ok"):
            raise RuntimeError(f"log_velocity failed: {result.get('error')}")

    # ── Config Tab ────────────────────────────────────────────

    def get_config(self) -> dict:
        """Read config as a key-value dict."""
        result = self._get("config")
        return result.get("config", {})

    def set_config(self, key: str, value: str):
        """Update a config value."""
        result = self._post({"action": "set_config", "key": key, "value": value})
        if not result.get("ok"):
            raise RuntimeError(f"set_config failed: {result.get('error')}")

    # ── PlanJSON Tab (Dashboard Data) ─────────────────────────

    def write_plan_json(self, plan_data: dict):
        """
        Write the full dashboard JSON blob to the PlanJSON tab.

        This is the preferred path for the dashboard — it reads
        the JSON directly rather than parsing the Today tab.
        Also sets current_plan_date in Config so the freshness check works.
        """
        result = self._post({"action": "write_plan_json", "data": plan_data})
        if not result.get("ok"):
            raise RuntimeError(f"write_plan_json failed: {result.get('error')}")
        # Update current_plan_date so dashboard knows this PlanJSON is fresh
        plan_date = (plan_data.get("meta") or {}).get("date", "")
        if plan_date:
            try:
                self.set_config("current_plan_date", plan_date)
            except Exception:
                pass  # non-critical — dashboard will fall back to Today tab

    # ── Status ────────────────────────────────────────────────

    def get_status(self) -> dict:
        """Get tab row counts and spreadsheet info."""
        return self._get("status")


# ── CLI interface for testing ────────────────────────────────

if __name__ == "__main__":
    usage = """Usage: python sheets_helper.py <command>

Commands:
    init      — Initialize spreadsheet (create tabs, headers, formatting, defaults)
    status    — Show tab row counts
    config    — Print config key-value pairs
    recurring — List active recurring tasks
    today     — Show today's plan
    history   — Show recent history (default 7 days)

Environment:
    DAILY_PLANNER_URL   — Your deployed Apps Script web app URL
                          (looks like: https://script.google.com/macros/s/AKfycb.../exec)
    DAILY_PLANNER_TOKEN — Shared secret matching planner_token in Config tab

Examples:
    export DAILY_PLANNER_URL="https://script.google.com/macros/s/AKfycb.../exec"
    export DAILY_PLANNER_TOKEN="your-secret-here"
    python sheets_helper.py init
    python sheets_helper.py status
"""
    if len(sys.argv) < 2:
        print(usage)
        sys.exit(1)

    cmd = sys.argv[1]

    try:
        sheets = DailyPlannerSheets()
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    if cmd == "init":
        result = sheets.initialize()
        if result.get("ok"):
            print(f"\nSpreadsheet ID: {result.get('spreadsheet_id')}")
            print(f"URL: {result.get('spreadsheet_url')}")
            print("Initialization complete!")
        else:
            print(f"Failed: {result.get('error')}")
            sys.exit(1)

    elif cmd == "status":
        status = sheets.get_status()
        if status.get("ok"):
            print(f"Spreadsheet: {status.get('url')}")
            for tab, rows in status.get("tabs", {}).items():
                print(f"  {tab}: {rows} rows")
        else:
            print(f"Failed: {status.get('error')}")

    elif cmd == "config":
        config = sheets.get_config()
        for k, v in config.items():
            print(f"  {k} = {v}")

    elif cmd == "recurring":
        tasks = sheets.get_active_recurring_tasks()
        for t in tasks:
            print(f"  [{t.get('Frequency')}] {t.get('Task')} - {t.get('Est. Hours')}h")

    elif cmd == "today":
        plan = sheets.get_today_plan()
        for t in plan:
            print(f"  {t.get('#')}. [{t.get('Priority')}] {t.get('Task')} ({t.get('Est. Hours')}h) - {t.get('Status')}")

    elif cmd == "history":
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
        result = sheets.get_history(days=days)
        print(f"  History ({result.get('days_queried', days)} days, {len(result.get('dates', []))} unique dates):")
        for d in result.get("dates", []):
            day_tasks = [t for t in result.get("tasks", []) if t.get("Date") == d]
            print(f"\n  {d} ({len(day_tasks)} tasks):")
            for t in day_tasks:
                print(f"    [{t.get('Priority', '?')}] {t.get('Task', '?')} - {t.get('Status', '?')}")

    else:
        print(f"Unknown command: {cmd}")
        print(usage)
        sys.exit(1)
