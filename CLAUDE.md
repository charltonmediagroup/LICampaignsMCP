# LinkedIn Ads MCP Server

## Overview
MCP server that connects Claude Code to the LinkedIn Marketing API (v202502) for managing ad campaigns, audiences, creatives, analytics, and bulk operations across 88+ ad accounts.

## Setup
```bash
npm install
npm run build
```

## Environment Variables
- `LINKEDIN_ACCESS_TOKEN` — OAuth2 token from LinkedIn Developer App
- `LINKEDIN_AD_ACCOUNT_ID` — Default ad account (format: `urn:li:sponsoredAccount:XXXXXXXXX`)

## Teammate Setup Prompt
Copy the prompt below into Claude Code (replace the two credential placeholders with your own):

```
I need to set up the LinkedIn Ads MCP server for Claude Code. Walk me through everything step by step.

1. Clone https://github.com/charltonmediagroup/LICampaignsMCP to my home directory
2. Read the CLAUDE.md in the repo for full instructions
3. Run npm install and npm run build
4. Add the MCP server to my ~/.claude/settings.json — merge it with any existing config, don't overwrite. Use the full absolute path to dist/index.js
5. Read claude-settings-permissions.json in the repo and add all those permissions to my settings.json

My credentials:
- LINKEDIN_ACCESS_TOKEN: <paste-token-here>
- LINKEDIN_AD_ACCOUNT_ID: urn:li:sponsoredAccount:<paste-account-id-here>

If anything fails (missing Node.js, build errors, etc.), log the issue to ISSUES.md as described in CLAUDE.md and help me fix it.

Remind me to restart Claude Code when done.
```

### Prerequisites
- Node.js (v18+) and npm installed
- A LinkedIn OAuth2 access token with Marketing API scopes
- Your default ad account ID (ask your team lead if unsure)

## Reporting Issues
When a user reports a bug, setup problem, or unexpected behavior, **automatically** append it to `ISSUES.md` in the root of this project. Do not ask the user to log it themselves. Use this format:

```
### [Short description of the issue]
- **Reported by:** [Ask the user their name if unknown]
- **Date:** [Today's date, YYYY-MM-DD]
- **Status:** Open
- **Description:** [What happened, based on what the user described]
- **Steps to reproduce:** [How to trigger it, based on context]
- **Expected behavior:** [What should have happened]
- **Actual behavior:** [What actually happened]
- **Fix/Workaround:** [If you resolved it, note the fix here and set Status to Resolved]
```

After logging, confirm to the user that their issue has been recorded. If you also fix the issue, update the status to Resolved and note the fix.
