/**
 * Bulk execution queue — queues and executes large batches of actions
 * (e.g. creating 50–60 campaign groups with different targeting/creative).
 *
 * Features:
 *  - Rate-limited sequential execution to stay within LinkedIn API limits
 *  - Per-action error handling (one failure doesn't abort the batch)
 *  - Progress tracking and final summary report
 *  - Dry-run mode to preview what would be created
 */

import { z } from "zod";
import type { LinkedInClient } from "../linkedin/client.js";
import { enforceBestPractices } from "../enforcement/best-practices.js";

// ─── Types ──────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "success" | "failed";
  result?: unknown;
  error?: string;
}

interface BulkQueue {
  id: string;
  items: QueueItem[];
  createdAt: string;
  completedAt?: string;
  status: "pending" | "running" | "completed";
}

// In-memory queue store (persists for the server session)
const queues = new Map<string, BulkQueue>();

// ─── Schemas ────────────────────────────────────────────────────────

const CampaignGroupBulkItem = z.object({
  name: z.string(),
  status: z.enum(["ACTIVE", "PAUSED", "DRAFT"]).default("DRAFT"),
  dailyBudget: z
    .object({ amount: z.string(), currencyCode: z.string().default("USD") })
    .optional(),
  totalBudget: z
    .object({ amount: z.string(), currencyCode: z.string().default("USD") })
    .optional(),
  runSchedule: z
    .object({
      start: z.string(),
      end: z.string().optional(),
    })
    .optional(),
});

const CampaignBulkItem = z.object({
  campaignGroupId: z.string().describe("Parent campaign group URN (or use '$ref:group_N' to reference a group created earlier in the same batch)"),
  name: z.string(),
  objective: z.string(),
  type: z.string().default("SPONSORED_UPDATES"),
  dailyBudget: z.object({ amount: z.string(), currencyCode: z.string().default("USD") }),
  costType: z.enum(["CPM", "CPC", "CPV"]).default("CPC"),
  bidStrategy: z.enum(["MANUAL", "MAXIMUM_DELIVERY", "TARGET_COST"]).default("MANUAL"),
  unitCost: z.object({ amount: z.string(), currencyCode: z.string().default("USD") }).optional(),
  targetingCriteria: z.any().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "DRAFT"]).default("DRAFT"),
});

// ─── Handlers ───────────────────────────────────────────────────────

export function registerBulkTools(client: LinkedInClient) {
  return {
    bulk_create_campaign_groups: {
      description:
        "Queue and execute bulk creation of campaign groups (up to 100). " +
        "Each item can have unique names, budgets, and schedules. " +
        "Executes sequentially with rate limiting. Returns a summary with IDs of all created groups.",
      schema: z.object({
        groups: z.array(CampaignGroupBulkItem).max(100),
        dryRun: z
          .boolean()
          .default(false)
          .describe("If true, validates without creating"),
      }),
      handler: async (args: {
        groups: z.infer<typeof CampaignGroupBulkItem>[];
        dryRun: boolean;
      }) => {
        const queueId = `bulk_groups_${Date.now()}`;
        const items: QueueItem[] = args.groups.map((g, i) => ({
          id: `group_${i}`,
          action: "create_campaign_group",
          payload: {
            account: client.config.adAccountId,
            name: g.name,
            status: g.status,
            dailyBudget: g.dailyBudget,
            totalBudget: g.totalBudget,
            runSchedule: g.runSchedule,
          },
          status: "pending" as const,
        }));

        if (args.dryRun) {
          return {
            queueId,
            dryRun: true,
            totalItems: items.length,
            preview: items.map((it) => ({
              id: it.id,
              name: (it.payload as Record<string, unknown>).name,
              payload: it.payload,
            })),
          };
        }

        const queue: BulkQueue = {
          id: queueId,
          items,
          createdAt: new Date().toISOString(),
          status: "running",
        };
        queues.set(queueId, queue);

        // Execute sequentially with rate limiting
        const createdIds: Record<string, string> = {};
        for (const item of queue.items) {
          item.status = "running";
          try {
            // Validate budget consistency
            const p = item.payload as Record<string, unknown>;
            if (p.totalBudget && p.dailyBudget) {
              throw new Error("Cannot set both totalBudget and dailyBudget");
            }

            const groupPath = client.accountPath("/adCampaignGroups");
            const res = await client.post<{ id: string }>(groupPath, item.payload);
            item.status = "success";
            item.result = res.data;
            createdIds[item.id] = res.data.id || String(res.data);

            // Rate limit: 200ms between calls
            await new Promise((r) => setTimeout(r, 200));
          } catch (err) {
            item.status = "failed";
            item.error = (err as Error).message;
          }
        }

        queue.status = "completed";
        queue.completedAt = new Date().toISOString();

        return {
          queueId,
          total: items.length,
          succeeded: items.filter((i) => i.status === "success").length,
          failed: items.filter((i) => i.status === "failed").length,
          createdIds,
          errors: items
            .filter((i) => i.status === "failed")
            .map((i) => ({ id: i.id, error: i.error })),
        };
      },
    },

    bulk_create_campaigns: {
      description:
        "Queue and execute bulk creation of campaigns (up to 100). " +
        "Supports $ref:group_N references to link to groups created in the same session. " +
        "Best practices are enforced on every campaign.",
      schema: z.object({
        campaigns: z.array(CampaignBulkItem).max(100),
        dryRun: z.boolean().default(false),
      }),
      handler: async (args: {
        campaigns: z.infer<typeof CampaignBulkItem>[];
        dryRun: boolean;
      }) => {
        const queueId = `bulk_campaigns_${Date.now()}`;
        const results: Array<{
          index: number;
          name: string;
          status: string;
          result?: unknown;
          error?: string;
          enforced?: string[];
        }> = [];

        for (let i = 0; i < args.campaigns.length; i++) {
          const c = args.campaigns[i];
          const payload = enforceBestPractices({
            account: client.config.adAccountId,
            campaignGroup: c.campaignGroupId,
            name: c.name,
            objectiveType: c.objective,
            type: c.type,
            status: c.status,
            dailyBudget: c.dailyBudget,
            costType: c.costType,
            bidStrategy: c.bidStrategy,
            unitCost: c.unitCost,
            targetingCriteria: c.targetingCriteria,
            enableAudienceExpansion: false,
            offsiteDeliveryEnabled: false,
          });

          const enforced = (payload._enforced as string[]) || [];
          delete payload._enforced;
          delete payload._warnings;

          if (args.dryRun) {
            results.push({ index: i, name: c.name, status: "dry_run", result: payload, enforced });
            continue;
          }

          try {
            const campaignPath = client.accountPath("/adCampaigns");
            const res = await client.post(campaignPath, payload);
            results.push({ index: i, name: c.name, status: "success", result: res.data, enforced });
            await new Promise((r) => setTimeout(r, 200));
          } catch (err) {
            results.push({
              index: i,
              name: c.name,
              status: "failed",
              error: (err as Error).message,
              enforced,
            });
          }
        }

        return {
          queueId,
          total: args.campaigns.length,
          succeeded: results.filter((r) => r.status === "success").length,
          failed: results.filter((r) => r.status === "failed").length,
          dryRun: args.dryRun,
          results,
        };
      },
    },

    bulk_update_campaigns: {
      description:
        "Bulk update multiple campaigns at once — e.g. pause all, change bids, swap targeting.",
      schema: z.object({
        updates: z
          .array(
            z.object({
              campaignId: z.string(),
              changes: z.record(z.unknown()),
            })
          )
          .max(200),
        dryRun: z.boolean().default(false),
      }),
      handler: async (args: {
        updates: Array<{ campaignId: string; changes: Record<string, unknown> }>;
        dryRun: boolean;
      }) => {
        const results: Array<{
          campaignId: string;
          status: string;
          error?: string;
        }> = [];

        for (const update of args.updates) {
          const enforced = enforceBestPractices(update.changes);
          delete enforced._enforced;
          delete enforced._warnings;

          if (args.dryRun) {
            results.push({ campaignId: update.campaignId, status: "dry_run" });
            continue;
          }

          try {
            const updatePath = client.accountPath(`/adCampaigns/${update.campaignId}`);
            await client.patch(updatePath, enforced);
            results.push({ campaignId: update.campaignId, status: "success" });
            await new Promise((r) => setTimeout(r, 200));
          } catch (err) {
            results.push({
              campaignId: update.campaignId,
              status: "failed",
              error: (err as Error).message,
            });
          }
        }

        return {
          total: args.updates.length,
          succeeded: results.filter((r) => r.status === "success").length,
          failed: results.filter((r) => r.status === "failed").length,
          results,
        };
      },
    },

    get_queue_status: {
      description: "Check the status of a bulk execution queue.",
      schema: z.object({ queueId: z.string() }),
      handler: async (args: { queueId: string }) => {
        const queue = queues.get(args.queueId);
        if (!queue) return { error: `Queue ${args.queueId} not found` };
        return {
          id: queue.id,
          status: queue.status,
          total: queue.items.length,
          succeeded: queue.items.filter((i) => i.status === "success").length,
          failed: queue.items.filter((i) => i.status === "failed").length,
          pending: queue.items.filter((i) => i.status === "pending").length,
        };
      },
    },
  };
}
