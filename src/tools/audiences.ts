/**
 * Audience / targeting tools — CRUD for saved audiences + bulk geo-swap.
 */

import { z } from "zod";
import type { LinkedInClient } from "../linkedin/client.js";

// ─── Schemas ────────────────────────────────────────────────────────

export const SavedAudienceSchema = z.object({
  name: z.string(),
  targetingCriteria: z.any().describe("Full LinkedIn targeting criteria object"),
});

export const BulkGeoSwapSchema = z.object({
  audienceIds: z
    .array(z.string())
    .describe("List of saved audience IDs to clone with new geo"),
  fromGeoUrn: z
    .string()
    .describe("Source geo URN, e.g. urn:li:geo:101165590 (UK)"),
  toGeoUrn: z
    .string()
    .describe("Target geo URN, e.g. urn:li:geo:103644278 (US)"),
  newNameSuffix: z
    .string()
    .default(" — US")
    .describe("Suffix appended to cloned audience names"),
});

// Common geo URNs for convenience
export const GEO_URNS = {
  UNITED_KINGDOM: "urn:li:geo:101165590",
  UNITED_STATES: "urn:li:geo:103644278",
  CANADA: "urn:li:geo:101174742",
  AUSTRALIA: "urn:li:geo:101452733",
  GERMANY: "urn:li:geo:101282230",
  FRANCE: "urn:li:geo:105015875",
  INDIA: "urn:li:geo:102713980",
  GLOBAL: "urn:li:geo:92000000",
} as const;

// ─── Handlers ───────────────────────────────────────────────────────

export function registerAudienceTools(client: LinkedInClient) {
  return {
    list_saved_audiences: {
      description: "List all saved/matched audiences in the ad account.",
      schema: z.object({}),
      handler: async () => {
        const res = await client.get("/dmpSegments", {
          q: "account",
          account: client.config.adAccountId,
        });
        return res.data;
      },
    },

    get_saved_audience: {
      description: "Get details of a single saved audience.",
      schema: z.object({ id: z.string() }),
      handler: async (args: { id: string }) => {
        const res = await client.get(`/dmpSegments/${args.id}`);
        return res.data;
      },
    },

    create_saved_audience: {
      description: "Create a new saved audience with targeting criteria.",
      schema: SavedAudienceSchema,
      handler: async (args: z.infer<typeof SavedAudienceSchema>) => {
        const res = await client.post("/dmpSegments", {
          account: client.config.adAccountId,
          name: args.name,
          targetingCriteria: args.targetingCriteria,
          type: "COMPANY_TARGETING",
        });
        return res.data;
      },
    },

    update_saved_audience: {
      description: "Update a saved audience's targeting criteria or name.",
      schema: z.object({
        id: z.string(),
        updates: z.record(z.unknown()),
      }),
      handler: async (args: { id: string; updates: Record<string, unknown> }) => {
        const res = await client.patch(`/dmpSegments/${args.id}`, args.updates);
        return res.data;
      },
    },

    delete_saved_audience: {
      description: "Delete a saved audience by ID.",
      schema: z.object({ id: z.string() }),
      handler: async (args: { id: string }) => {
        await client.del(`/dmpSegments/${args.id}`);
        return { success: true, deleted: args.id };
      },
    },

    bulk_geo_swap_audiences: {
      description:
        "Clone a list of saved audiences, replacing one geo-location with another. " +
        "E.g., swap UK targeting to US and auto-create new audiences with updated names.",
      schema: BulkGeoSwapSchema,
      handler: async (args: z.infer<typeof BulkGeoSwapSchema>) => {
        const results: Array<{ originalId: string; newAudience?: unknown; error?: string }> = [];

        for (const audienceId of args.audienceIds) {
          try {
            // 1. Fetch existing audience
            const existing = await client.get<{
              name: string;
              targetingCriteria: Record<string, unknown>;
            }>(`/dmpSegments/${audienceId}`);
            const original = existing.data;

            // 2. Deep-clone targeting and swap geo URNs
            const newTargeting = JSON.parse(
              JSON.stringify(original.targetingCriteria)
            );
            swapGeoInTargeting(newTargeting, args.fromGeoUrn, args.toGeoUrn);

            // 3. Create new audience
            const newName = `${original.name}${args.newNameSuffix}`;
            const created = await client.post("/dmpSegments", {
              account: client.config.adAccountId,
              name: newName,
              targetingCriteria: newTargeting,
              type: "COMPANY_TARGETING",
            });

            results.push({ originalId: audienceId, newAudience: created.data });
          } catch (err) {
            results.push({
              originalId: audienceId,
              error: (err as Error).message,
            });
          }
        }

        return {
          total: args.audienceIds.length,
          succeeded: results.filter((r) => !r.error).length,
          failed: results.filter((r) => r.error).length,
          results,
        };
      },
    },

    search_targeting_entities: {
      description:
        "Search for targeting entities like job titles, skills, industries, companies.",
      schema: z.object({
        facet: z
          .enum([
            "employers",
            "titles",
            "skills",
            "industries",
            "schools",
            "degrees",
            "fieldsOfStudy",
            "seniorities",
            "jobFunctions",
          ])
          .describe("Targeting facet to search"),
        query: z.string().describe("Search query"),
      }),
      handler: async (args: { facet: string; query: string }) => {
        const res = await client.get("/adTargetingEntities", {
          q: "typeahead",
          facet: `urn:li:adTargetingFacet:${args.facet}`,
          query: args.query,
        });
        return res.data;
      },
    },

    get_audience_size: {
      description: "Estimate audience size for given targeting criteria.",
      schema: z.object({
        targetingCriteria: z.any().describe("Targeting criteria object"),
      }),
      handler: async (args: { targetingCriteria: unknown }) => {
        const res = await client.post("/adTargetingAnalytics", {
          account: client.config.adAccountId,
          targetingCriteria: args.targetingCriteria,
        });
        return res.data;
      },
    },

    get_geo_urns: {
      description: "Get common geo URNs for targeting (convenience helper).",
      schema: z.object({}),
      handler: async () => GEO_URNS,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function swapGeoInTargeting(
  obj: Record<string, unknown>,
  fromUrn: string,
  toUrn: string
): void {
  const json = JSON.stringify(obj);
  const swapped = json.replaceAll(fromUrn, toUrn);
  const parsed = JSON.parse(swapped);
  Object.assign(obj, parsed);
}
