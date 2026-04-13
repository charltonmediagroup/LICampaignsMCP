# LinkedIn Ads MCP Server

An [MCP](https://modelcontextprotocol.io/) server that connects Claude (Code or Desktop) to the LinkedIn Ads API, giving you natural-language control over campaign management, audience targeting, creative uploads, analytics, and account auditing.

## What it does

| Category | Capabilities |
|----------|-------------|
| **Campaigns** | Create, list, update campaign groups and campaigns |
| **Audiences** | Create/edit saved audiences, bulk geo-swap targeting |
| **Creatives** | Upload images and videos, create ad creatives |
| **Analytics** | Campaign and creative performance reports, account summaries |
| **Auditing** | 10-point account audit (CTR decline, budget utilization, missing conversion tracking, etc.) |
| **Bulk ops** | Queue and execute batch campaign/group creation and updates |

Best-practice enforcement is built in — audience expansion and audience network are disabled by default on every write operation.

## Prerequisites

- Node.js 18+
- A LinkedIn Developer App with **Advertising API** access ([apply here](https://www.linkedin.com/developers/apps))
- OAuth scopes: `r_ads`, `rw_ads`, `r_ads_reporting`, `r_basicprofile`
- Your LinkedIn Ad Account ID

## Quick start

```bash
git clone <this-repo-url>
cd linkedin-ads-mcp-server
npm install
cp .env.example .env
# Edit .env with your LinkedIn credentials
npm run build
npm start
```

You should see: `LinkedIn Ads MCP server running — 34 tools registered`

## Connecting to Claude

### Claude Code (CLI)

Add to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "linkedin-ads": {
      "command": "node",
      "args": ["/path/to/linkedin-ads-mcp-server/dist/index.js"],
      "env": {
        "LINKEDIN_ACCESS_TOKEN": "your_token",
        "LINKEDIN_AD_ACCOUNT_ID": "urn:li:sponsoredAccount:123456789"
      }
    }
  }
}
```

### Claude Desktop

Add the same `mcpServers` block to `%APPDATA%/Claude/claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

Restart Claude after updating the config.

## Usage

Once connected, just talk to Claude:

- "List my campaign groups"
- "Create a new campaign group called Q3 Brand Awareness"
- "Run a full account audit"
- "Show analytics for my top 5 campaigns this month"
- "Swap targeting from UK to US for all saved audiences"

To target a different ad account without restarting, pass it inline:

- "List campaigns for account urn:li:sponsoredAccount:987654321"

## Full setup guide

See [SETUP.md](SETUP.md) for detailed instructions covering:

1. Creating a LinkedIn Developer App
2. Generating OAuth tokens
3. Linking your ad account
4. Configuring Claude Code / Claude Desktop
5. Token refresh for production use
6. Upgrading to Standard API tier

## Token expiration

Access tokens expire after 60 days. See [SETUP.md Part 5](SETUP.md#part-5-token-refresh-production-use) for the refresh flow.

## License

MIT
