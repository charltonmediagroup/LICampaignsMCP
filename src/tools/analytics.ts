/**
 * Reporting & analytics tools — pull performance data across campaigns and creatives.
 */

import { z } from "zod";
import type { LinkedInClient } from "../linkedin/client.js";

const DateRangeSchema = z.object({
  startDate: z.string().describe("Start date YYYY-MM-DD"),
  endDate: z.string().describe("End date YYYY-MM-DD"),
});

export function registerAnalyticsTools(client: LinkedInClient) {
  return {
    get_campaign_analytics: {
      description:
        "Pull performance metrics for one or more campaigns over a date range.",
      schema: z.object({
        campaignIds: z.array(z.string()).describe("Campaign URNs"),
        dateRange: DateRangeSchema,
        granularity: z.enum(["DAILY", "MONTHLY", "ALL"]).default("DAILY"),
        fields: z
          .array(z.string())
          .default([
            "impressions",
            "clicks",
            "costInLocalCurrency",
            "conversions",
            "costPerConversion",
          ])
          .describe("Metric fields to retrieve"),
      }),
      handler: async (args: {
        campaignIds: string[];
        dateRange: { startDate: string; endDate: string };
        granularity: string;
        fields: string[];
      }) => {
        const [startYear, startMonth, startDay] = args.dateRange.startDate.split("-");
        const [endYear, endMonth, endDay] = args.dateRange.endDate.split("-");

        const params: Record<string, string> = {
          q: "analytics",
          pivot: "CAMPAIGN",
          timeGranularity: args.granularity,
          "dateRange.start.year": startYear,
          "dateRange.start.month": startMonth,
          "dateRange.start.day": startDay,
          "dateRange.end.year": endYear,
          "dateRange.end.month": endMonth,
          "dateRange.end.day": endDay,
          fields: args.fields.join(","),
        };
        args.campaignIds.forEach((id, i) => {
          params[`campaigns[${i}]`] = id;
        });

        const res = await client.get("/adAnalytics", params);
        return res.data;
      },
    },

    get_creative_analytics: {
      description: "Pull performance metrics at the creative/ad level.",
      schema: z.object({
        campaignId: z.string(),
        dateRange: DateRangeSchema,
        granularity: z.enum(["DAILY", "MONTHLY", "ALL"]).default("ALL"),
      }),
      handler: async (args: {
        campaignId: string;
        dateRange: { startDate: string; endDate: string };
        granularity: string;
      }) => {
        const [startYear, startMonth, startDay] = args.dateRange.startDate.split("-");
        const [endYear, endMonth, endDay] = args.dateRange.endDate.split("-");

        const res = await client.get("/adAnalytics", {
          q: "analytics",
          pivot: "CREATIVE",
          timeGranularity: args.granularity,
          "campaigns[0]": args.campaignId,
          "dateRange.start.year": startYear,
          "dateRange.start.month": startMonth,
          "dateRange.start.day": startDay,
          "dateRange.end.year": endYear,
          "dateRange.end.month": endMonth,
          "dateRange.end.day": endDay,
          fields: "impressions,clicks,costInLocalCurrency,conversions,videoViews,leads",
        });
        return res.data;
      },
    },

    get_account_summary: {
      description:
        "Get a high-level summary of account performance over a date range.",
      schema: z.object({ dateRange: DateRangeSchema }),
      handler: async (args: {
        dateRange: { startDate: string; endDate: string };
      }) => {
        const [startYear, startMonth, startDay] = args.dateRange.startDate.split("-");
        const [endYear, endMonth, endDay] = args.dateRange.endDate.split("-");

        const res = await client.get("/adAnalytics", {
          q: "analytics",
          pivot: "ACCOUNT",
          timeGranularity: "ALL",
          "accounts[0]": client.config.adAccountId,
          "dateRange.start.year": startYear,
          "dateRange.start.month": startMonth,
          "dateRange.start.day": startDay,
          "dateRange.end.year": endYear,
          "dateRange.end.month": endMonth,
          "dateRange.end.day": endDay,
          fields:
            "impressions,clicks,costInLocalCurrency,conversions,costPerConversion",
        });
        return res.data;
      },
    },

    get_conversion_tracking: {
      description: "List all conversion rules configured on the account.",
      schema: z.object({}),
      handler: async () => {
        const res = await client.get("/conversions", {
          q: "account",
          account: client.config.adAccountId,
        });
        return res.data;
      },
    },

    get_lead_form_responses: {
      description: "Pull lead gen form responses for a specific form.",
      schema: z.object({
        formId: z.string().describe("Lead gen form URN"),
        startDate: z.string().optional(),
      }),
      handler: async (args: { formId: string; startDate?: string }) => {
        const params: Record<string, string> = {
          q: "form",
          form: args.formId,
        };
        if (args.startDate) params.submittedAfter = args.startDate;
        const res = await client.get("/leadFormResponses", params);
        return res.data;
      },
    },
  };
}
