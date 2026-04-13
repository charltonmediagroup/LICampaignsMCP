/**
 * Campaign & Campaign Group management tools.
 * Enforces: no mixed objectives per group, no mixed budget types.
 */

import { z } from "zod";
import type { LinkedInClient } from "../linkedin/client.js";
import { enforceBestPractices } from "../enforcement/best-practices.js";

/** Optional account override — add to any tool schema for multi-account support */
const accountIdParam = z
  .string()
  .optional()
  .describe("Override ad account URN (defaults to env LINKEDIN_AD_ACCOUNT_ID)");

// ─── Schemas ────────────────────────────────────────────────────────

export const CampaignGroupCreateSchema = z.object({
  name: z.string().describe("Campaign group name"),
  status: z
    .enum(["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT"])
    .default("DRAFT")
    .describe("Initial status"),
  runSchedule: z
    .object({
      start: z.string().describe("ISO 8601 start date"),
      end: z.string().optional().describe("ISO 8601 end date (optional)"),
    })
    .optional(),
  totalBudget: z
    .object({
      amount: z.string(),
      currencyCode: z.string().default("USD"),
    })
    .optional()
    .describe("Total lifetime budget"),
  dailyBudget: z
    .object({
      amount: z.string(),
      currencyCode: z.string().default("USD"),
    })
    .optional()
    .describe("Daily budget cap"),
});

export const CampaignCreateSchema = z.object({
  campaignGroupId: z.string().describe("Parent campaign group URN"),
  name: z.string().describe("Campaign name"),
  objective: z
    .enum([
      "BRAND_AWARENESS",
      "ENGAGEMENT",
      "VIDEO_VIEWS",
      "LEAD_GENERATION",
      "WEBSITE_VISITS",
      "WEBSITE_CONVERSIONS",
      "JOB_APPLICANTS",
    ])
    .describe("Campaign objective"),
  type: z
    .enum(["TEXT_AD", "SPONSORED_UPDATES", "SPONSORED_INMAILS", "DYNAMIC"])
    .default("SPONSORED_UPDATES"),
  status: z.enum(["ACTIVE", "PAUSED", "DRAFT"]).default("DRAFT"),
  dailyBudget: z.object({
    amount: z.string(),
    currencyCode: z.string().default("USD"),
  }),
  costType: z.enum(["CPM", "CPC", "CPV"]).default("CPC"),
  bidStrategy: z
    .enum(["MANUAL", "MAXIMUM_DELIVERY", "TARGET_COST"])
    .default("MANUAL")
    .describe("Bid strategy — defaults to MANUAL per best practices"),
  unitCost: z
    .object({ amount: z.string(), currencyCode: z.string().default("USD") })
    .optional()
    .describe("Manual bid amount (required when bidStrategy is MANUAL)"),
  targetingCriteria: z.any().optional().describe("Targeting facets object"),
  // These two get force-overridden by the enforcement layer
  enableAudienceExpansion: z.boolean().optional(),
  offsiteDeliveryEnabled: z.boolean().optional(),
});

// ─── Handlers ───────────────────────────────────────────────────────

export function registerCampaignTools(client: LinkedInClient) {
  return {
    // ── Campaign Groups ────────────────────────────────────────────

    list_campaign_groups: {
      description:
        "List all campaign groups in the ad account. Returns names, statuses, budgets.",
      schema: z.object({
        accountId: accountIdParam,
        status: z
          .enum(["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT"])
          .optional()
          .describe("Filter by status"),
      }),
      handler: async (args: { accountId?: string; status?: string }) => {
        const path = client.accountPath("/adCampaignGroups", args.accountId);
        const params: Record<string, string> = {
          q: "search",
        };
        if (args.status) {
          params["search.status.values[0]"] = args.status;
        }
        const res = await client.get(path, params);
        return res.data;
      },
    },

    get_campaign_group: {
      description: "Get details of a single campaign group by ID.",
      schema: z.object({ id: z.string().describe("Campaign group ID") }),
      handler: async (args: { id: string }) => {
        const path = client.accountPath(`/adCampaignGroups/${args.id}`);
        const res = await client.get(path);
        return res.data;
      },
    },

    create_campaign_group: {
      description:
        "Create a new campaign group. Validates that budget type is consistent.",
      schema: CampaignGroupCreateSchema,
      handler: async (args: z.infer<typeof CampaignGroupCreateSchema>) => {
        const body: Record<string, unknown> = {
          account: client.config.adAccountId,
          name: args.name,
          status: args.status,
        };
        if (args.runSchedule) body.runSchedule = args.runSchedule;
        if (args.totalBudget) body.totalBudget = args.totalBudget;
        if (args.dailyBudget) body.dailyBudget = args.dailyBudget;

        // Validation: cannot have both total and daily budget
        if (args.totalBudget && args.dailyBudget) {
          return {
            error:
              "Cannot set both totalBudget and dailyBudget on a campaign group. Choose one.",
          };
        }

        const path = client.accountPath("/adCampaignGroups");
        const res = await client.post(path, body);
        return res.data;
      },
    },

    update_campaign_group: {
      description: "Update an existing campaign group.",
      schema: z.object({
        id: z.string(),
        updates: z.record(z.unknown()).describe("Fields to update"),
      }),
      handler: async (args: { id: string; updates: Record<string, unknown> }) => {
        const path = client.accountPath(`/adCampaignGroups/${args.id}`);
        const res = await client.patch(path, args.updates);
        return res.data;
      },
    },

    // ── Campaigns ──────────────────────────────────────────────────

    list_campaigns: {
      description: "List campaigns, optionally filtered by group or status.",
      schema: z.object({
        accountId: accountIdParam,
        campaignGroupId: z.string().optional(),
        status: z.enum(["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"]).optional(),
      }),
      handler: async (args: { accountId?: string; campaignGroupId?: string; status?: string }) => {
        const path = client.accountPath("/adCampaigns", args.accountId);
        const params: Record<string, string> = {
          q: "search",
        };
        if (args.status) params["search.status.values[0]"] = args.status;
        const res = await client.get<{ elements: Array<Record<string, unknown>>; paging?: unknown; metadata?: unknown }>(path, params);
        // Client-side filter by campaign group if requested
        if (args.campaignGroupId) {
          const filtered = (res.data.elements || []).filter(
            (c) => c.campaignGroup === args.campaignGroupId
          );
          return { ...res.data, elements: filtered };
        }
        return res.data;
      },
    },

    get_campaign: {
      description: "Get full details of a single campaign.",
      schema: z.object({ id: z.string() }),
      handler: async (args: { id: string }) => {
        const path = client.accountPath(`/adCampaigns/${args.id}`);
        const res = await client.get(path);
        return res.data;
      },
    },

    create_campaign: {
      description:
        "Create a new campaign. Enforces best practices: audience expansion OFF, audience network OFF, manual bidding default.",
      schema: CampaignCreateSchema,
      handler: async (args: z.infer<typeof CampaignCreateSchema>) => {
        // ── Objective consistency check ───────────────────────────
        // Pull sibling campaigns in the same group to verify objective match
        const siblingsPath = client.accountPath("/adCampaigns");
        const siblings = await client.get<{ elements: Array<{ objectiveType: string; campaignGroup: string }> }>(
          siblingsPath,
          { q: "search" }
        );
        const siblingCampaigns = (siblings.data.elements || []).filter(
          (c) => c.campaignGroup === args.campaignGroupId
        );
        const existingObjectives = new Set(
          siblingCampaigns.map((c) => c.objectiveType)
        );
        if (
          existingObjectives.size > 0 &&
          !existingObjectives.has(args.objective)
        ) {
          return {
            error: `Objective mismatch: group already contains campaigns with objective(s) [${[...existingObjectives].join(", ")}]. Adding a "${args.objective}" campaign here would mix objectives. Create a separate campaign group instead.`,
          };
        }

        // ── Build payload with enforcement ───────────────────────
        const enforced = enforceBestPractices({
          account: client.config.adAccountId,
          campaignGroup: args.campaignGroupId,
          name: args.name,
          objectiveType: args.objective,
          type: args.type,
          status: args.status,
          dailyBudget: args.dailyBudget,
          costType: args.costType,
          unitCost: args.unitCost,
          targetingCriteria: args.targetingCriteria,
          offsiteDeliveryEnabled: args.offsiteDeliveryEnabled,
          locale: { country: "US", language: "en" },
          runSchedule: { start: Date.now() },
        });

        // Capture enforcement info, then strip internal fields before sending
        const enforcementInfo = {
          audienceExpansion: "DISABLED (enforced)",
          audienceNetwork: enforced.offsiteDeliveryEnabled === false ? "DISABLED (enforced)" : "enabled",
          bidStrategy: enforced.bidStrategy || "MANUAL",
          warnings: enforced._warnings,
        };

        // Remove fields the LinkedIn API doesn't accept
        const { _enforced, _warnings, enableAudienceExpansion, bidStrategy, ...apiBody } = enforced;

        const campaignPath = client.accountPath("/adCampaigns");
        const res = await client.post(campaignPath, apiBody);
        const resData = res.data as Record<string, unknown>;
        return {
          ...resData,
          _enforcement: enforcementInfo,
        };
      },
    },

    update_campaign: {
      description: "Update a campaign. Re-applies best-practice enforcement.",
      schema: z.object({
        id: z.string(),
        updates: z.record(z.unknown()),
      }),
      handler: async (args: { id: string; updates: Record<string, unknown> }) => {
        const enforced = enforceBestPractices(args.updates);
        const { _enforced, _warnings, enableAudienceExpansion, bidStrategy, ...apiBody } = enforced;
        const path = client.accountPath(`/adCampaigns/${args.id}`);
        const res = await client.patch(path, apiBody);
        return { ...res.data as Record<string, unknown>, _enforced, _warnings };
      },
    },
  };
}
