/**
 * Company engagement analysis tools — identify which companies are engaging with your ads.
 *
 * Uses LinkedIn's adAnalytics API with COMPANY pivot to surface company-level engagement data,
 * plus the organizationPageStatistics for deeper company interaction insights.
 */

import { z } from "zod";
import type { LinkedInClient } from "../linkedin/client.js";

const DateRangeSchema = z.object({
  startDate: z.string().describe("Start date YYYY-MM-DD"),
  endDate: z.string().describe("End date YYYY-MM-DD"),
});

export function registerEngagementTools(client: LinkedInClient) {
  return {
    get_company_engagement: {
      description:
        "Analyze which companies are engaging with your ad campaigns. " +
        "Shows company-level impressions, clicks, and engagement metrics. " +
        "Useful for ABM (account-based marketing) insights and sales handoff.",
      schema: z.object({
        campaignIds: z
          .array(z.string())
          .optional()
          .describe("Campaign URNs to analyze (omit for all active campaigns)"),
        dateRange: DateRangeSchema,
        accountId: z
          .string()
          .optional()
          .describe("Override ad account URN"),
      }),
      handler: async (args: {
        campaignIds?: string[];
        dateRange: { startDate: string; endDate: string };
        accountId?: string;
      }) => {
        const [startYear, startMonth, startDay] = args.dateRange.startDate.split("-");
        const [endYear, endMonth, endDay] = args.dateRange.endDate.split("-");

        const params: Record<string, string> = {
          q: "analytics",
          pivot: "COMPANY",
          timeGranularity: "ALL",
          "dateRange.start.year": startYear,
          "dateRange.start.month": startMonth,
          "dateRange.start.day": startDay,
          "dateRange.end.year": endYear,
          "dateRange.end.month": endMonth,
          "dateRange.end.day": endDay,
          fields:
            "impressions,clicks,costInLocalCurrency,conversions,externalWebsiteConversions,likes,comments,shares,follows,totalEngagements",
        };

        if (args.campaignIds && args.campaignIds.length > 0) {
          args.campaignIds.forEach((id, i) => {
            params[`campaigns[${i}]`] = id;
          });
        } else {
          const accountId = args.accountId || client.config.adAccountId;
          params["accounts[0]"] = accountId;
        }

        const res = await client.get<{
          elements: Array<Record<string, unknown>>;
        }>("/adAnalytics", params);
        const elements = res.data.elements || [];

        // Parse and rank companies by engagement
        const companies = elements
          .map((el) => {
            const impressions = Number(el.impressions) || 0;
            const clicks = Number(el.clicks) || 0;
            const conversions =
              (Number(el.conversions) || 0) +
              (Number(el.externalWebsiteConversions) || 0);
            const engagements =
              clicks +
              (Number(el.likes) || 0) +
              (Number(el.comments) || 0) +
              (Number(el.shares) || 0) +
              (Number(el.follows) || 0);
            const spend = Number(el.costInLocalCurrency) || 0;
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            const engagementRate =
              impressions > 0 ? (engagements / impressions) * 100 : 0;

            return {
              companyUrn: el.pivotValue as string,
              impressions,
              clicks,
              conversions,
              engagements,
              spend: spend.toFixed(2),
              ctr: ctr.toFixed(2) + "%",
              engagementRate: engagementRate.toFixed(2) + "%",
            };
          })
          .sort((a, b) => b.engagements - a.engagements);

        // Categorize engagement levels
        const highEngagement = companies.filter((c) => c.engagements >= 10 || c.conversions >= 1);
        const mediumEngagement = companies.filter(
          (c) => c.engagements >= 3 && c.engagements < 10 && c.conversions === 0
        );
        const lowEngagement = companies.filter((c) => c.engagements < 3 && c.engagements > 0);

        return {
          dateRange: args.dateRange,
          totalCompanies: companies.length,
          summary: {
            highEngagement: highEngagement.length,
            mediumEngagement: mediumEngagement.length,
            lowEngagement: lowEngagement.length,
          },
          topCompanies: companies.slice(0, 50),
          insights: {
            hotLeads: highEngagement.slice(0, 20).map((c) => ({
              ...c,
              signal: "High engagement — strong buying intent signal",
            })),
            warming: mediumEngagement.slice(0, 20).map((c) => ({
              ...c,
              signal: "Moderate engagement — nurture with targeted content",
            })),
          },
          recommendations: [
            highEngagement.length > 0
              ? `${highEngagement.length} companies show strong engagement — pass these to sales as warm leads.`
              : "No high-engagement companies yet — consider running campaigns longer or broadening targeting.",
            companies.length > 100
              ? "Large number of companies reached — consider ABM retargeting for top engagers."
              : "Audience reach is narrow — expanding targeting may surface more engaged companies.",
            "Use company engagement data to build matched audience retargeting lists for high-value accounts.",
          ],
        };
      },
    },

    get_company_engagement_by_campaign: {
      description:
        "Break down company engagement per campaign to see which campaigns " +
        "are driving engagement from specific companies. Useful for ABM campaign comparison.",
      schema: z.object({
        campaignIds: z.array(z.string()).describe("Campaign URNs to compare"),
        dateRange: DateRangeSchema,
      }),
      handler: async (args: {
        campaignIds: string[];
        dateRange: { startDate: string; endDate: string };
      }) => {
        const [startYear, startMonth, startDay] = args.dateRange.startDate.split("-");
        const [endYear, endMonth, endDay] = args.dateRange.endDate.split("-");

        const results: Array<{
          campaignId: string;
          totalCompanies: number;
          topCompanies: Array<Record<string, unknown>>;
        }> = [];

        for (const campaignId of args.campaignIds) {
          const params: Record<string, string> = {
            q: "analytics",
            pivot: "COMPANY",
            timeGranularity: "ALL",
            "campaigns[0]": campaignId,
            "dateRange.start.year": startYear,
            "dateRange.start.month": startMonth,
            "dateRange.start.day": startDay,
            "dateRange.end.year": endYear,
            "dateRange.end.month": endMonth,
            "dateRange.end.day": endDay,
            fields: "impressions,clicks,conversions,totalEngagements",
          };

          const res = await client.get<{
            elements: Array<Record<string, unknown>>;
          }>("/adAnalytics", params);
          const elements = res.data.elements || [];

          const companies = elements
            .map((el) => ({
              companyUrn: el.pivotValue,
              impressions: Number(el.impressions) || 0,
              clicks: Number(el.clicks) || 0,
              conversions: Number(el.conversions) || 0,
              engagements: Number(el.totalEngagements) || 0,
            }))
            .sort(
              (a, b) => b.engagements - a.engagements
            );

          results.push({
            campaignId,
            totalCompanies: companies.length,
            topCompanies: companies.slice(0, 20),
          });
        }

        // Find companies that appear across multiple campaigns
        const companyAppearances: Record<string, string[]> = {};
        for (const r of results) {
          for (const c of r.topCompanies) {
            const urn = c.companyUrn as string;
            if (!companyAppearances[urn]) companyAppearances[urn] = [];
            companyAppearances[urn].push(r.campaignId);
          }
        }
        const crossCampaignEngagers = Object.entries(companyAppearances)
          .filter(([, campaigns]) => campaigns.length > 1)
          .map(([companyUrn, campaigns]) => ({ companyUrn, engagedAcrossCampaigns: campaigns }));

        return {
          dateRange: args.dateRange,
          campaignBreakdowns: results,
          crossCampaignEngagers,
          insight:
            crossCampaignEngagers.length > 0
              ? `${crossCampaignEngagers.length} companies engaged across multiple campaigns — these are your highest-intent prospects.`
              : "No cross-campaign engagement overlap detected yet.",
        };
      },
    },
  };
}
