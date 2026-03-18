# Daily Planner — User Configuration

Customize this file with your personal data. Save as `my-config.md` in this directory. The skill references these tables during execution.

## Role
- **Flavor**: dev | pm
- **Focus**: (see `my-config.dev.md` or `my-config.pm.md` for role-specific guidance)

Choose your flavor:
- **dev** — Developer/engineer. Primary signals: Jira sprint items, GitHub PRs, Outlook calendar. Email filtered aggressively.
- **pm** — Project manager. Primary signals: Outlook calendar and email. Jira for project oversight. GitHub optional.

## Identity
- **Name**: Your Name
- **Email**: you@example.com
- **Work hours**: 9am–5pm (your timezone)
- **Daily capacity**: 8h (minus meetings and buffer)

## Scope Rules

### Excluded Repositories (personal, not work)
- `your-username/personal-repo` — personal project, never include in work plans

### Excluded Calendar Sources
- **Google Calendar** — if your work calendar is elsewhere, exclude personal calendars here
- Specify your work calendar source (e.g., Outlook, Google Calendar)

### Excluded Task Sources
- Personal/family tasks and projects
- Any task whose source is clearly personal rather than professional

### Work Repositories (include these)
- List your work org repos here

## Jira
- **Cloud ID**: your-jira-cloud-id
- Use `getAccessibleAtlassianResources` to discover your cloud ID

## Slack
- **Workspace**: your-workspace
- **User ID**: YOUR_SLACK_ID
