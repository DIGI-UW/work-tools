# Optional: Outlook calendar via the `work-tools` MCP (API pull)

This is **optional**. The skill's Step 3 works out of the box via Chrome. Set this up only if you
want the no-click API path for the calendar read (nicer for scheduled runs). It adds an
`outlook_list_events` MCP tool that Step 3 auto-detects.

## How the auth works (why it survives a locked tenant)

There is **no Azure app registration and no admin consent**. The `work-tools` server launches Chrome
with a persistent profile (`~/.work-mcp-profile`) that holds your normal Outlook SSO cookies, sniffs
the Bearer token that Outlook Web itself uses, and calls the Outlook REST API
(`https://outlook.office365.com/api/v2.0/me/calendarview`) directly. To the tenant it looks like you
using Outlook on the web. Token caches to `~/.outlook-mcp-token.json` (mode 0600, ~15-min TTL,
auto-refreshes headlessly from the profile cookies).

## One-time setup (macOS, verified 2026-07-30)

Prereqs: Node 20+ (nvm fine), git, Google Chrome, and the `claude` CLI.

```bash
# 1. Clone and build the MCP server
mkdir -p ~/dev && cd ~/dev
git clone https://github.com/DIGI-UW/work-tools.git
cd work-tools/mcp-servers/work-tools
npm install
npx tsc                      # builds dist/index.js

# 2. Playwright is needed for the browser token capture (dynamic import)
npm install playwright

# 3. Register the server with Claude (user scope = available to Cowork + scheduled tasks)
claude mcp add --scope user work-tools -- node "$HOME/dev/work-tools/mcp-servers/work-tools/dist/index.js"
claude mcp list              # expect: work-tools ... ✓ Connected
```

## One-time Outlook sign-in (seeds the profile + token)

`warmup.sh` is now a stub — warmup is an MCP tool. Capture the first token by calling the `warmup`
(or `outlook_refresh`) tool from a Claude session, **or** run this one-off script, which opens Chrome
so you can complete the UW SSO login once:

```bash
cat > /tmp/outlook-warmup.mjs <<'EOF'
import { captureBearerToken } from "/Users/<you>/dev/work-tools/mcp-servers/work-tools/dist/browser-auth.js";
import { writeFileSync } from "fs";
const res = await captureBearerToken({
  url: "https://outlook.office365.com/mail/",
  matchUrl: "outlook.office365.com",
  headless: false, timeout: 300000,
});
writeFileSync(`${process.env.HOME}/.outlook-mcp-token.json`,
  JSON.stringify({ token: res.token, capturedAt: Date.now() }), { mode: 0o600 });
console.log("TOKEN_CAPTURED_OK");
EOF
node /tmp/outlook-warmup.mjs      # sign in when Chrome opens; token is captured automatically
```

After the profile is warm, refreshes are headless — no more clicking.

## Verify

```bash
# Direct REST check (proves the token + API work):
node -e '
const {readFileSync}=require("fs");
const {token}=JSON.parse(readFileSync(process.env.HOME+"/.outlook-mcp-token.json","utf8"));
const u=new URL("https://outlook.office365.com/api/v2.0/me/calendarview");
u.searchParams.set("startDateTime","2026-07-27T00:00:00");
u.searchParams.set("endDateTime","2026-08-01T00:00:00");
u.searchParams.set("$select","Subject,Start,End,IsCancelled");
u.searchParams.set("$orderby","Start/DateTime");
fetch(u,{headers:{Authorization:"Bearer "+token,Accept:"application/json",Prefer:"outlook.timezone=\"America/Los_Angeles\""}})
  .then(r=>r.json()).then(d=>console.log((d.value||[]).length+" events"));
'
```

In a **new** Claude/Cowork session the `outlook_list_events` tool will be available; Step 3 Option A
picks it up automatically. Call it with `start_date` / `end_date` = the target Mon–Fri.

## Notes / gotchas
- Register mid-session and the tool won't appear until the next session starts.
- If a call 401s, the server auto-refreshes; if that fails, re-run the sign-in script (the SSO
  cookies in `~/.work-mcp-profile` may have expired).
- `OUTLOOK_TIMEZONE=America/Los_Angeles` keeps Graph times aligned with the Pacific Harvest account;
  it's auto-detected from the host but can be set in `.env.local` or `~/.work-tools.env`.
- This never commits a token anywhere; everything lives in your home dir.
