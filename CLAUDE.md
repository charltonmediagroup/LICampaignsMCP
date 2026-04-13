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
Clone and paste this into Claude Code (replace credentials with your own):

```
Clone the LinkedIn Ads MCP server from https://github.com/charltonmediagroup/LICampaignsMCP, install dependencies, build it, and configure it as an MCP server in my Claude Code settings (~/.claude/settings.json).

My credentials:
- LINKEDIN_ACCESS_TOKEN: <paste-token-here>
- LINKEDIN_AD_ACCOUNT_ID: urn:li:sponsoredAccount:<paste-account-id-here>

Also add permissions to auto-allow all mcp__linkedin-ads__* tools. Remind me to restart Claude Code when done.
```

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
