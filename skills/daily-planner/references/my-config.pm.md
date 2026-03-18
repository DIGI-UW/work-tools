# Daily Planner — User Configuration (Project Manager)

## Role
- **Flavor**: pm
- **Focus**: Meetings, email follow-ups, and project coordination. Primary signals are Outlook calendar and email. Jira is used for project-level oversight (not sprint-level task work). GitHub is optional and low-priority.

### Signal Priorities (PM mode)
| Source | Priority | What to surface |
|--------|----------|-----------------|
| Outlook calendar | **Primary** | All meetings today/tomorrow — these ARE the work |
| Outlook email | **Primary** | Threads needing reply, action items, stakeholder requests |
| Jira | Secondary | Project status, blockers across teams, approaching deadlines |
| Slack | Secondary | Direct mentions, team channel activity, meeting follow-ups |
| GitHub | Low | Only if explicitly relevant (e.g., release blocking a deliverable) |
| Harvest | Low | Hours tracking for awareness, not planning driver |

### How PM mode differs from Dev mode
- **Meetings are work, not interruptions.** Don't treat meetings as "overhead" — for a PM, the meeting IS the deliverable. Time-block prep and follow-up around each meeting.
- **Email is a primary signal.** Surface email threads that need replies, escalations, and stakeholder requests. Don't aggressively filter like dev mode does.
- **Jira = oversight, not task work.** Show project health, cross-team blockers, and approaching deadlines — not individual sprint items to work on.
- **GitHub is optional.** Only include if a PR/release directly affects a deliverable the PM is tracking.
- **Follow-ups matter most.** After each meeting block, schedule a 15-min follow-up slot for notes, action items, and delegation.

## Identity
- **Name**: Your Name
- **Email**: you@example.com
- **Work hours**: 9am–5pm (your timezone)
- **Daily capacity**: 8h (minus meetings and buffer)

## Scope Rules

### Excluded Calendar Sources
- **Google Calendar** — if your work calendar is elsewhere, exclude personal calendars here
- Specify your work calendar source (e.g., Outlook, Google Calendar)

### Excluded Task Sources
- Personal/family tasks and projects
- Any task whose source is clearly personal rather than professional

## Jira
- **Cloud ID**: your-jira-cloud-id
- Use `getAccessibleAtlassianResources` to discover your cloud ID

## Slack
- **Workspace**: your-workspace
- **User ID**: YOUR_SLACK_ID
