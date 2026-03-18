#!/usr/bin/env python3
"""
Standalone Outlook client for the Daily Planner skill.

Captures auth tokens via Playwright (same browser approach as the work-tools MCP
server) and calls the Office 365 REST API directly. This makes the skill
self-sufficient — no MCP server dependency for Outlook data.

Token sharing: Uses the same token file (~/.outlook-mcp-token.json) and Chrome
profile (~/.work-mcp-profile) as the MCP server. Tokens captured by either path
are interchangeable.

Prerequisites: pip install playwright  (browser binaries shared with Node Playwright)

Usage:
    python outlook_client.py status
    python outlook_client.py refresh
    python outlook_client.py list-events --start 2026-03-18 --end 2026-03-19
    python outlook_client.py list-emails --limit 20 --from-date 2026-03-17
"""

import argparse
import json
import os
import ssl
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def _ssl_context() -> ssl.SSLContext:
    """Create an SSL context that works on macOS framework Python."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()

# ── Config ─────────────────────────────────────────────────

API_BASE = "https://outlook.office365.com/api/v2.0/me"
TTL_S = 15 * 60  # 15 minutes
TOKEN_FILE = Path.home() / ".outlook-mcp-token.json"
PROFILE_DIR = os.environ.get("WORK_MCP_PROFILE", str(Path.home() / ".work-mcp-profile"))
OUTLOOK_URL = "https://outlook.office365.com/mail/"
MATCH_URL = "outlook.office365.com"


# ── Token management ───────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[outlook] {msg}", file=sys.stderr)


def load_token() -> tuple[str | None, float]:
    """Load token from disk. Returns (token, captured_at) or (None, 0)."""
    try:
        data = json.loads(TOKEN_FILE.read_text())
        token, captured_at = data["token"], data["capturedAt"] / 1000  # ms → s
        if time.time() - captured_at < TTL_S:
            return token, captured_at
    except (FileNotFoundError, KeyError, json.JSONDecodeError, ValueError):
        pass
    return None, 0


def save_token(token: str) -> float:
    """Save token to disk (mode 0o600). Returns capture timestamp (seconds)."""
    captured_at = time.time()
    TOKEN_FILE.write_text(json.dumps({
        "token": token,
        "capturedAt": int(captured_at * 1000),  # s → ms (match MCP server format)
    }))
    TOKEN_FILE.chmod(0o600)
    return captured_at


def time_remaining(captured_at: float) -> int:
    """Minutes remaining on the token."""
    remaining = TTL_S - (time.time() - captured_at)
    return max(0, int(remaining / 60))


def capture_token(headless: bool = False) -> str:
    """Capture Bearer token via Playwright browser automation.

    Opens Chrome with the persistent profile, navigates to Outlook, and
    intercepts the Bearer token from outgoing API requests. This is the
    same mechanism used by the MCP server's browser-auth.ts.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        _log("Playwright not installed. Run: pip install playwright")
        sys.exit(1)

    mode = "auto-refreshing" if headless else "capturing"
    _log(f"{mode.capitalize()} token...")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            PROFILE_DIR,
            headless=headless,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            page = context.new_page()
            captured = {"token": None}

            def on_request(request):
                url = request.url
                headers = request.headers
                auth = headers.get("authorization", "")
                if auth.startswith("Bearer ") and MATCH_URL in url:
                    captured["token"] = auth[7:]

            page.on("request", on_request)
            page.goto(OUTLOOK_URL)

            # Wait for token capture (poll — sync API doesn't support async promises)
            deadline = time.time() + 300  # 5 min timeout
            while not captured["token"] and time.time() < deadline:
                page.wait_for_timeout(500)

            if not captured["token"]:
                raise TimeoutError("Token capture timed out after 5 minutes")

            token = captured["token"]
            save_token(token)
            _log("Token captured.")
            return token
        finally:
            context.close()


def get_token() -> str:
    """Get a valid token — from cache, disk, or headless auto-refresh."""
    token, _ = load_token()
    if token:
        return token
    try:
        return capture_token(headless=True)
    except Exception as e:
        raise RuntimeError(
            f"Outlook auto-refresh failed: {e}. "
            "Run: python outlook_client.py refresh"
        ) from e


# ── HTTP helper ────────────────────────────────────────────

def api_fetch(path: str, params: dict | None = None) -> dict:
    """GET from the Office 365 REST API with Bearer auth and 401 retry."""
    token = get_token()

    url = f"{API_BASE}{path}"
    if params:
        url += "?" + urlencode(params)

    req = Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    })

    ctx = _ssl_context()
    try:
        with urlopen(req, context=ctx) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        if e.code != 401:
            raise
    # 401 — invalidate and retry with fresh token
    _log("Token expired, attempting auto-refresh...")
    try:
        TOKEN_FILE.unlink(missing_ok=True)
    except OSError:
        pass
    try:
        new_token = capture_token(headless=True)
    except Exception:
        raise RuntimeError(
            "Outlook token expired and auto-refresh failed. "
            "Run: python outlook_client.py refresh"
        )

    req = Request(url, headers={
        "Authorization": f"Bearer {new_token}",
        "Accept": "application/json",
    })
    with urlopen(req, context=ctx) as resp:
        return json.loads(resp.read())


# ── API functions ──────────────────────────────────────────

def list_events(start: str | None = None, end: str | None = None) -> list[dict]:
    """List calendar events for a date range (default: next 7 days)."""
    s = datetime.fromisoformat(start) if start else datetime.now(timezone.utc)
    e = datetime.fromisoformat(end) if end else s + timedelta(days=7)

    data = api_fetch("/calendarview", {
        "startDateTime": s.isoformat(),
        "endDateTime": e.isoformat(),
        "$top": "200",
        "$select": "Id,Subject,Start,End,Location,Organizer,IsAllDay,IsCancelled",
        "$orderby": "Start/DateTime",
    })

    return [
        {
            "id": ev["Id"],
            "subject": ev["Subject"],
            "start": ev["Start"]["DateTime"],
            "end": ev["End"]["DateTime"],
            "timezone": ev["Start"]["TimeZone"],
            "location": (ev.get("Location") or {}).get("DisplayName") or None,
            "organizer": (ev.get("Organizer", {}).get("EmailAddress") or {}).get("Address"),
            "allDay": ev.get("IsAllDay", False),
            "cancelled": ev.get("IsCancelled", False),
        }
        for ev in data.get("value", [])
        if not ev.get("IsCancelled", False)
    ]


def list_emails(
    folder: str = "inbox",
    limit: int = 20,
    skip: int = 0,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[dict]:
    """List emails from a folder with optional date filtering."""
    params: dict[str, str] = {
        "$top": str(limit),
        "$select": "Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead",
        "$orderby": "ReceivedDateTime desc",
    }
    if skip > 0:
        params["$skip"] = str(skip)

    filters = []
    if from_date:
        filters.append(f"ReceivedDateTime ge {from_date}T00:00:00Z")
    if to_date:
        filters.append(f"ReceivedDateTime lt {to_date}T23:59:59Z")
    if filters:
        params["$filter"] = " and ".join(filters)

    data = api_fetch(f"/mailfolders/{folder}/messages", params)

    return [
        {
            "id": em["Id"],
            "subject": em["Subject"],
            "from": f"{em['From']['EmailAddress']['Name']} <{em['From']['EmailAddress']['Address']}>",
            "date": em["ReceivedDateTime"],
            "preview": em.get("BodyPreview", ""),
            "read": em.get("IsRead", False),
        }
        for em in data.get("value", [])
    ]


# ── CLI ────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Standalone Outlook client for calendar and email.",
        epilog="Shares auth tokens with the work-tools MCP server.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # status
    sub.add_parser("status", help="Check token status")

    # refresh
    sub.add_parser("refresh", help="Force interactive token refresh (opens browser)")

    # list-events
    ev = sub.add_parser("list-events", help="List calendar events")
    ev.add_argument("--start", help="Start date (YYYY-MM-DD)")
    ev.add_argument("--end", help="End date (YYYY-MM-DD)")

    # list-emails
    em = sub.add_parser("list-emails", help="List emails")
    em.add_argument("--folder", default="inbox", help="Mail folder (default: inbox)")
    em.add_argument("--limit", type=int, default=20, help="Max emails (default: 20)")
    em.add_argument("--skip", type=int, default=0, help="Skip first N emails")
    em.add_argument("--from-date", help="Emails on or after (YYYY-MM-DD)")
    em.add_argument("--to-date", help="Emails before (YYYY-MM-DD)")

    args = parser.parse_args()

    try:
        result: object = None

        if args.command == "status":
            token, captured_at = load_token()
            mins = time_remaining(captured_at) if token else 0
            result = {
                "connected": token is not None,
                "minutes_remaining": mins,
                "message": f"Outlook active ({mins}m remaining)" if token else "No session. Run: python outlook_client.py refresh",
            }

        elif args.command == "refresh":
            capture_token(headless=False)
            _, captured_at = load_token()
            mins = time_remaining(captured_at)
            result = {"message": f"Token refreshed. {mins}m remaining."}

        elif args.command == "list-events":
            result = list_events(start=args.start, end=args.end)

        elif args.command == "list-emails":
            result = list_emails(
                folder=args.folder,
                limit=args.limit,
                skip=args.skip,
                from_date=args.from_date,
                to_date=args.to_date,
            )

        json.dump(result, sys.stdout, indent=2)
        print()  # trailing newline

    except Exception as e:
        json.dump({"error": str(e)}, sys.stdout, indent=2)
        print()
        sys.exit(1)


if __name__ == "__main__":
    main()
