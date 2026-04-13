# LinkedIn Ads MCP Server — Complete Setup Guide

## Part 1: Create a LinkedIn Developer Application

### Step 1: Create a LinkedIn Company Page (if you don't have one)

1. Go to https://www.linkedin.com/company/setup/new/
2. Fill in your company name, URL, and industry
3. Click **Create page**
4. You need a Company Page because LinkedIn requires one to associate with a developer app

### Step 2: Create a Developer Application

1. Go to https://www.linkedin.com/developers/apps/new
2. Fill in the form:
   - **App name**: Something like "LinkedIn Ads MCP Server"
   - **LinkedIn Page**: Select the Company Page you created in Step 1
   - **Privacy policy URL**: Your company's privacy policy (required)
   - **App logo**: Upload any logo (required)
3. Check the **Terms of Service** box
4. Click **Create app**
5. You will be taken to your app's dashboard — **keep this tab open**

### Step 3: Apply for Advertising API Access

1. In your app dashboard, click the **Products** tab
2. Find **Advertising API** in the list
3. Click **Request access**
4. Fill out the access request form:
   - Describe your use case (e.g., "Programmatic campaign management and reporting via MCP server integration")
   - Submit the form
5. **Wait for approval** — this can take 1–3 business days
6. Once approved, you'll see "Advertising API" listed under your Products with a green checkmark

### Step 4: Verify Your Permissions (OAuth Scopes)

1. In your app dashboard, click the **Auth** tab
2. Scroll down to **OAuth 2.0 scopes**
3. Confirm these scopes are listed:
   - `r_ads` — Read ad accounts, campaigns, creatives
   - `rw_ads` — Create and update campaigns, audiences, creatives
   - `r_ads_reporting` — Pull performance analytics
   - `r_basicprofile` — Read your own profile (needed for auth)
4. If any are missing, go back to the **Products** tab and ensure Advertising API is approved

### Step 5: Copy Your Client Credentials

1. Still on the **Auth** tab, find:
   - **Client ID** — copy this (looks like `86abc1234defg5`)
   - **Client Secret** — click the eye icon to reveal, then copy
2. Also note your **Redirect URL** — you'll need to set one:
   - Click **Edit** next to Authorized Redirect URLs
   - Add: `https://www.linkedin.com/developers/tools/oauth/redirect`
   - Click **Update**
3. Save both the Client ID and Client Secret somewhere secure

---

## Part 2: Generate Your Access Token

### Option A: Token Generator Tool (Quickest — Recommended for Setup)

1. Go to https://www.linkedin.com/developers/tools/oauth/token-generator
2. Select your app from the dropdown
3. Check all available scopes:
   - [x] r_ads
   - [x] rw_ads
   - [x] r_ads_reporting
   - [x] r_basicprofile
4. Click **Request access token**
5. You'll be redirected to a LinkedIn login/consent screen — click **Allow**
6. Copy the generated **Access Token**

> **Important**: This token expires in 60 days. For production, you'll need to implement OAuth 2.0 refresh token flow (covered in Part 5).

### Option B: Manual OAuth 2.0 Flow (If Token Generator Doesn't Work)

#### Step B1: Get an Authorization Code

Open this URL in your browser (replace YOUR_CLIENT_ID):

```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https://www.linkedin.com/developers/tools/oauth/redirect&scope=r_ads,rw_ads,r_ads_reporting,r_basicprofile
```

1. Log in to LinkedIn if prompted
2. Click **Allow** on the consent screen
3. You'll be redirected — copy the `code` parameter from the URL bar:
   ```
   https://www.linkedin.com/developers/tools/oauth/redirect?code=AQR1234...xyz
   ```

#### Step B2: Exchange the Code for an Access Token

Run this command in your terminal (replace the three placeholder values):

```bash
curl -X POST "https://www.linkedin.com/oauth/v2/accessToken" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://www.linkedin.com/developers/tools/oauth/redirect"
```

The response will look like:

```json
{
  "access_token": "AQV...very_long_string",
  "expires_in": 5184000,
  "refresh_token": "AQX...another_long_string",
  "refresh_token_expires_in": 31536000
}
```

Copy the `access_token` value. Save the `refresh_token` too — you'll need it to get new access tokens without repeating this flow.

---

## Part 3: Link Your Ad Account

### Step 1: Find Your Ad Account ID

1. Go to https://www.linkedin.com/campaignmanager/accounts
2. You'll see a list of ad accounts — find the one you want to connect
3. The **9-digit number** shown next to the account name is your Account ID
   - Example: if it shows `512345678`, your full URN is `urn:li:sponsoredAccount:512345678`
4. Copy this number

### Step 2: Map the Ad Account to Your Developer App

1. Go back to https://www.linkedin.com/developers/apps
2. Click on your app
3. Go to the **Products** tab
4. Click **View Ad Accounts** (under Advertising API)
5. Click **Add Ad Account**
6. Paste your 9-digit Ad Account ID
7. Click **Save**

### Step 3: Verify Access Works

Run this test command (replace YOUR_ACCESS_TOKEN and YOUR_ACCOUNT_ID):

```bash
curl -s -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "LinkedIn-Version: 202404" \
  -H "X-Restli-Protocol-Version: 2.0.0" \
  "https://api.linkedin.com/rest/adAccounts/YOUR_ACCOUNT_ID"
```

You should get a JSON response with your account details. If you get a 401 or 403, double-check:
- Token is correct and not expired
- Ad account is mapped to your app
- Scopes include `r_ads`

---

## Part 4: Configure and Run the MCP Server

### Step 1: Set Up Environment Variables

```bash
cd C:/LinkedInCampaigns
cp .env.example .env
```

Edit the `.env` file with your actual values:

```
LINKEDIN_ACCESS_TOKEN=AQV...your_actual_token
LINKEDIN_AD_ACCOUNT_ID=urn:li:sponsoredAccount:512345678
```

### Step 2: Build the Server

```bash
cd C:/LinkedInCampaigns
npm install
npm run build
```

### Step 3: Test the Server Starts

```bash
npm start
```

You should see: `LinkedIn Ads MCP server running — 34 tools registered`

Press Ctrl+C to stop it (Claude will launch it automatically).

### Step 4: Register with Claude Code (CLI)

Create or edit the file `C:/Users/HP/.claude/settings.json` and add:

```json
{
  "mcpServers": {
    "linkedin-ads": {
      "command": "node",
      "args": ["C:/LinkedInCampaigns/dist/index.js"],
      "env": {
        "LINKEDIN_ACCESS_TOKEN": "AQV...your_actual_token",
        "LINKEDIN_AD_ACCOUNT_ID": "urn:li:sponsoredAccount:512345678"
      }
    }
  },
  "permissions": {
    "allow": [
      "mcp__linkedin-ads__list_campaign_groups",
      "mcp__linkedin-ads__get_campaign_group",
      "mcp__linkedin-ads__create_campaign_group",
      "mcp__linkedin-ads__update_campaign_group",
      "mcp__linkedin-ads__list_campaigns",
      "mcp__linkedin-ads__get_campaign",
      "mcp__linkedin-ads__create_campaign",
      "mcp__linkedin-ads__update_campaign",
      "mcp__linkedin-ads__list_saved_audiences",
      "mcp__linkedin-ads__get_saved_audience",
      "mcp__linkedin-ads__create_saved_audience",
      "mcp__linkedin-ads__update_saved_audience",
      "mcp__linkedin-ads__delete_saved_audience",
      "mcp__linkedin-ads__bulk_geo_swap_audiences",
      "mcp__linkedin-ads__search_targeting_entities",
      "mcp__linkedin-ads__get_audience_size",
      "mcp__linkedin-ads__get_geo_urns",
      "mcp__linkedin-ads__upload_image",
      "mcp__linkedin-ads__upload_video",
      "mcp__linkedin-ads__list_creatives",
      "mcp__linkedin-ads__create_ad_creative",
      "mcp__linkedin-ads__get_creative",
      "mcp__linkedin-ads__get_campaign_analytics",
      "mcp__linkedin-ads__get_creative_analytics",
      "mcp__linkedin-ads__get_account_summary",
      "mcp__linkedin-ads__get_conversion_tracking",
      "mcp__linkedin-ads__get_lead_form_responses",
      "mcp__linkedin-ads__run_full_audit",
      "mcp__linkedin-ads__check_single_audit",
      "mcp__linkedin-ads__bulk_create_campaign_groups",
      "mcp__linkedin-ads__bulk_create_campaigns",
      "mcp__linkedin-ads__bulk_update_campaigns",
      "mcp__linkedin-ads__get_queue_status"
    ]
  }
}
```

### Step 5: Register with Claude Desktop (if using the desktop app instead)

Edit the file at: `%APPDATA%/Claude/claude_desktop_config.json`

To find this file:
1. Press `Win + R`
2. Type `%APPDATA%/Claude` and press Enter
3. Open `claude_desktop_config.json` (create it if it doesn't exist)

Add the same `mcpServers` block from Step 4.

### Step 6: Restart Claude and Verify

1. Fully quit and reopen Claude Code or Claude Desktop
2. You should see the LinkedIn Ads tools available
3. Test with a simple command: "List my campaign groups"

---

## Part 5: Token Refresh (Production Use)

The access token from Part 2 expires in **60 days**. To avoid manual regeneration:

### Refresh Token Flow

When your token is close to expiring, run:

```bash
curl -X POST "https://www.linkedin.com/oauth/v2/accessToken" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=YOUR_REFRESH_TOKEN" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

This returns a new access token and refresh token. Update your `.env` and Claude settings with the new access token.

### Check Token Status

Use the Token Inspector to check if your token is still valid:
https://www.linkedin.com/developers/tools/oauth/token-inspector

---

## Part 6: Upgrading to Standard Tier (For Production Scale)

The **Development tier** has rate limits and restricted endpoints. For full production use with 120+ endpoints and bulk operations:

1. Build and test your integration using Development tier
2. Go to https://www.linkedin.com/developers/apps → your app → **Products** tab
3. Click **Request Standard Tier Access** under Advertising API
4. You'll need to submit:
   - A **screen recording** (video) showing your integration creating, editing, or optimizing LinkedIn campaigns
   - A description of your platform and use case
5. LinkedIn reviews the submission (typically 5–10 business days)
6. Once approved, rate limits increase and all endpoints become available

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `401 Unauthorized` | Token expired — regenerate using Part 2 or refresh using Part 5 |
| `403 Forbidden` | Missing scopes — check Auth tab in Developer Portal for r_ads, rw_ads, r_ads_reporting |
| `403` on specific ad account | Ad account not mapped — redo Part 3, Step 2 |
| Server won't start | Check `.env` has both LINKEDIN_ACCESS_TOKEN and LINKEDIN_AD_ACCOUNT_ID |
| Tools not showing in Claude | Restart Claude fully — check settings.json path is correct |
| Rate limit (429) errors | Built-in retry handles this, but reduce bulk batch sizes if persistent |
| `INVALID_RESOURCE` on campaign create | Check the campaign group URN format: `urn:li:sponsoredCampaignGroup:123456` |
