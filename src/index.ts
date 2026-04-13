/**
 * LinkedIn Ads MCP Server
 *
 * Exposes LinkedIn Ads API operations as MCP tools for use within Claude.
 * Covers: campaign management, audiences, creatives, analytics, auditing, bulk ops.
 * Best-practice enforcement is applied automatically on every write operation.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLinkedInClient } from "./linkedin/client.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerAudienceTools } from "./tools/audiences.js";
import { registerCreativeTools } from "./tools/creatives.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerAuditTools } from "./tools/audit.js";
import { registerBulkTools } from "./tools/bulk.js";

// ─── Environment ────────────────────────────────────────────────────

const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const DEFAULT_AD_ACCOUNT_ID = process.env.LINKEDIN_AD_ACCOUNT_ID;

if (!ACCESS_TOKEN || !DEFAULT_AD_ACCOUNT_ID) {
  console.error(
    "Missing required env vars: LINKEDIN_ACCESS_TOKEN, LINKEDIN_AD_ACCOUNT_ID"
  );
  process.exit(1);
}

// ─── Initialize ─────────────────────────────────────────────────────

const linkedIn = createLinkedInClient({
  accessToken: ACCESS_TOKEN,
  adAccountId: DEFAULT_AD_ACCOUNT_ID,
});

const server = new McpServer({
  name: "linkedin-ads",
  version: "1.0.0",
});

// ─── Account management tools (multi-account) ──────────────────────

import { z } from "zod";
import { resolveAccountId } from "./linkedin/client.js";

const accountTools = {
  list_ad_accounts: {
    description:
      "List all LinkedIn Ad accounts the authenticated user has access to. " +
      "Use this to find account IDs when managing multiple accounts.",
    schema: z.object({}),
    handler: async () => {
      const res = await linkedIn.get<{
        elements: Array<{
          id: string;
          name: string;
          status: string;
          currency: string;
          type: string;
          account: string;
        }>;
      }>("/adAccountUsers", {
        q: "authenticatedUser",
      });

      const accounts = (res.data.elements || []).map((el) => ({
        accountUrn: el.account,
        role: el.type,
        status: el.status,
      }));

      return {
        defaultAccount: DEFAULT_AD_ACCOUNT_ID,
        totalAccounts: accounts.length,
        accounts,
        usage:
          "Pass any accountUrn as the 'accountId' parameter on other tools to target that account. " +
          "If omitted, tools default to: " + DEFAULT_AD_ACCOUNT_ID,
      };
    },
  },

  switch_default_account: {
    description:
      "Show which account is currently the default, and explain how to target a different one.",
    schema: z.object({}),
    handler: async () => ({
      currentDefault: DEFAULT_AD_ACCOUNT_ID,
      howToSwitch:
        "You don't need to switch — just pass 'accountId' on any tool call to target a different account. " +
        "Example: create_campaign({ accountId: 'urn:li:sponsoredAccount:987654321', ... }). " +
        "To permanently change the default, update LINKEDIN_AD_ACCOUNT_ID in your env/config.",
    }),
  },
};

// ─── Register all tool groups ───────────────────────────────────────

const toolGroups = {
  ...accountTools,
  ...registerCampaignTools(linkedIn),
  ...registerAudienceTools(linkedIn),
  ...registerCreativeTools(linkedIn),
  ...registerAnalyticsTools(linkedIn),
  ...registerAuditTools(linkedIn),
  ...registerBulkTools(linkedIn),
};

// Wire each tool into the MCP server
for (const [name, tool] of Object.entries(toolGroups)) {
  const { description, schema, handler } = tool as {
    description: string;
    schema: import("zod").ZodType;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  };

  server.tool(name, description, (schema as any)._def?.shape?.() ?? {}, async (args: Record<string, unknown>) => {
    try {
      const result = await handler(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: (err as Error).message,
                tool: name,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });
}

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`LinkedIn Ads MCP server running — ${Object.keys(toolGroups).length} tools registered`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
