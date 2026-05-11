/**
 * AI-powered optimization recommendations engine.
 *
 * Analyzes campaign data and generates actionable recommendations
 * covering budget, bidding, targeting, creative, and scheduling.
 */

import { z } from "zod";
import type { LinkedInClient } from "../linkedin/client.js";

export interface Recommendation {
  priority: "high" | "medium" | "low";
  category: string;
  campaign: string;
  campaignName: string;
  finding: string;
  recommendation: string;
  estimatedImpact: string;
}

export function registerOptimizationTools(client: LinkedInClient) {
  return {
    get_optimization_recommendations: {
      description:
        "Analyze all active campaigns and generate prioritized optimization recommendations. " +
        "Covers: budget allocation, bid strategy, audience targeting, creative performance, " +
        "scheduling, and cost efficiency. Returns actionable suggestions ranked by impact.",
      schema: z.object({
        lookbackDays: z
          .number()
          .default(28)
          .describe("Days of data to analyze (default 28)"),
        accountId: z
          .string()
          .optional()
          .describe("Override ad account URN"),
      }),
      handler: async (args: { lookbackDays: number; accountId?: string }) => {
        const recommendations: Recommendation[] = [];

        // Pull all active campaigns
        const campaignsPath = client.accountPath("/adCampaigns", args.accountId);
        const campaignsRes = await client.get<{
          elements: Array<{
            id: string;
            name: string;
            status: string;
            enableAudienceExpansion?: boolean;
            offsiteDeliveryEnabled?: boolean;
            bidStrategy?: string;
            dailyBudget?: { amount: string; currencyCode: string };
            costType?: string;
            objectiveType?: string;
            targetingCriteria?: Record<string, unknown>;
            type?: string;
          }>;
        }>(campaignsPath, {
          q: "search",
          "search.status.values[0]": "ACTIVE",
        });
        const campaigns = campaignsRes.data.elements || [];

        if (campaigns.length === 0) {
          return {
            message: "No active campaigns found. Activate campaigns to get optimization recommendations.",
            recommendations: [],
          };
        }

        // Pull analytics for the lookback period
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - args.lookbackDays);
        const fmt = (d: Date) => d.toISOString().split("T")[0];

        const [startYear, startMonth, startDay] = fmt(startDate).split("-");
        const [endYear, endMonth, endDay] = fmt(endDate).split("-");

        const analyticsParams: Record<string, string> = {
          q: "analytics",
          pivot: "CAMPAIGN",
          timeGranularity: "DAILY",
          "dateRange.start.year": startYear,
          "dateRange.start.month": startMonth,
          "dateRange.start.day": startDay,
          "dateRange.end.year": endYear,
          "dateRange.end.month": endMonth,
          "dateRange.end.day": endDay,
          fields:
            "impressions,clicks,costInLocalCurrency,conversions,externalWebsiteConversions,likes,comments,shares",
        };
        campaigns.slice(0, 20).forEach((c, i) => {
          analyticsParams[`campaigns[${i}]`] = `urn:li:sponsoredCampaign:${c.id}`;
        });

        const analyticsRes = await client.get<{
          elements: Array<Record<string, unknown>>;
        }>("/adAnalytics", analyticsParams);
        const analyticsElements = analyticsRes.data.elements || [];

        // Aggregate per campaign
        const campaignStats: Map<
          string,
          {
            impressions: number;
            clicks: number;
            spend: number;
            conversions: number;
            engagements: number;
            dailyData: Array<{ date: string; impressions: number; clicks: number; spend: number }>;
          }
        > = new Map();

        for (const el of analyticsElements) {
          const pivotValue = String(el.pivotValue || "");
          const idMatch = pivotValue.match(/(\d+)$/);
          if (!idMatch) continue;
          const campaignId = idMatch[1];

          const existing = campaignStats.get(campaignId) || {
            impressions: 0,
            clicks: 0,
            spend: 0,
            conversions: 0,
            engagements: 0,
            dailyData: [],
          };

          const impressions = Number(el.impressions) || 0;
          const clicks = Number(el.clicks) || 0;
          const spend = Number(el.costInLocalCurrency) || 0;
          const conversions =
            (Number(el.conversions) || 0) + (Number(el.externalWebsiteConversions) || 0);
          const engagements =
            clicks +
            (Number(el.likes) || 0) +
            (Number(el.comments) || 0) +
            (Number(el.shares) || 0);

          existing.impressions += impressions;
          existing.clicks += clicks;
          existing.spend += spend;
          existing.conversions += conversions;
          existing.engagements += engagements;

          const dateRange = el.dateRange as {
            start?: { year: number; month: number; day: number };
          } | undefined;
          if (dateRange?.start) {
            existing.dailyData.push({
              date: `${dateRange.start.year}-${dateRange.start.month}-${dateRange.start.day}`,
              impressions,
              clicks,
              spend,
            });
          }

          campaignStats.set(campaignId, existing);
        }

        // ── Analysis per campaign ────────────────────────────────────

        for (const campaign of campaigns) {
          const stats = campaignStats.get(campaign.id);
          if (!stats) continue;

          const ctr = stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0;
          const cpc = stats.clicks > 0 ? stats.spend / stats.clicks : 0;
          const cpm = stats.impressions > 0 ? (stats.spend / stats.impressions) * 1000 : 0;
          const convRate = stats.clicks > 0 ? (stats.conversions / stats.clicks) * 100 : 0;
          const dailyBudget = campaign.dailyBudget
            ? parseFloat(campaign.dailyBudget.amount)
            : 0;
          const avgDailySpend = stats.spend / Math.max(args.lookbackDays, 1);

          // 1. Budget utilization
          if (dailyBudget > 0) {
            const utilization = avgDailySpend / dailyBudget;
            if (utilization < 0.5) {
              recommendations.push({
                priority: "high",
                category: "Budget",
                campaign: campaign.id,
                campaignName: campaign.name,
                finding: `Only spending ${(utilization * 100).toFixed(0)}% of daily budget ($${avgDailySpend.toFixed(2)}/$${dailyBudget}).`,
                recommendation:
                  "Broaden targeting criteria, increase bid amount, or reduce daily budget to match delivery capacity.",
                estimatedImpact: "Could recover underutilized budget for reallocation to better-performing campaigns.",
              });
            } else if (utilization > 0.95) {
              recommendations.push({
                priority: "medium",
                category: "Budget",
                campaign: campaign.id,
                campaignName: campaign.name,
                finding: `Campaign is consistently hitting budget cap (${(utilization * 100).toFixed(0)}% utilization).`,
                recommendation:
                  "Consider increasing daily budget — this campaign has demand headroom that's being capped.",
                estimatedImpact: "10-30% more impressions and conversions by lifting the budget cap.",
              });
            }
          }

          // 2. CTR optimization
          if (stats.impressions > 1000 && ctr < 0.3) {
            recommendations.push({
              priority: "high",
              category: "Creative",
              campaign: campaign.id,
              campaignName: campaign.name,
              finding: `CTR is very low at ${ctr.toFixed(2)}% (benchmark ~0.4%).`,
              recommendation:
                "Refresh ad creatives — test new headlines, images, and CTAs. Consider carousel or video formats for higher engagement.",
              estimatedImpact: "Improving CTR from 0.3% to 0.4% would increase clicks by ~33% at the same spend.",
            });
          } else if (stats.impressions > 1000 && ctr < 0.4) {
            recommendations.push({
              priority: "medium",
              category: "Creative",
              campaign: campaign.id,
              campaignName: campaign.name,
              finding: `CTR at ${ctr.toFixed(2)}% is slightly below the 0.4% benchmark.`,
              recommendation:
                "A/B test creative variations — try stronger value propositions, social proof, or urgency in copy.",
              estimatedImpact: "Small CTR improvements compound: 0.1% CTR increase = significantly more clicks over time.",
            });
          }

          // 3. CPC efficiency
          if (stats.clicks > 50 && cpc > 8) {
            recommendations.push({
              priority: "high",
              category: "Bidding",
              campaign: campaign.id,
              campaignName: campaign.name,
              finding: `CPC is high at $${cpc.toFixed(2)} (benchmark ~$5.39).`,
              recommendation:
                "If using MAXIMUM_DELIVERY, switch to MANUAL bidding with a cap. Narrow targeting to reduce auction competition. Improve ad relevance score.",
              estimatedImpact: `Reducing CPC to $5.50 would save ~$${((cpc - 5.5) * stats.clicks).toFixed(0)} over this period.`,
            });
          }

          // 4. Conversion optimization
          if (stats.clicks > 100 && stats.conversions === 0) {
            recommendations.push({
              priority: "high",
              category: "Conversions",
              campaign: campaign.id,
              campaignName: campaign.name,
              finding: `${stats.clicks} clicks but zero conversions — $${stats.spend.toFixed(2)} spent with no ROI.`,
              recommendation:
                "Check conversion tracking setup. If tracking is working, optimize the landing page: ensure message match, simplify forms, add trust signals.",
              estimatedImpact: "Even a 1% conversion rate would yield ~" + Math.round(stats.clicks * 0.01) + " conversions.",
            });
          } else if (stats.clicks > 100 && convRate < 1) {
            recommendations.push({
              priority: "medium",
              category: "Conversions",
              campaign: campaign.id,
              campaignName: campaign.name,
              finding: `Conversion rate is ${convRate.toFixed(2)}% — below the 2% benchmark.`,
              recommendation:
                "Optimize landing page experience. Consider LinkedIn Lead Gen Forms (pre-filled fields = less friction). Test different offers.",
              estimatedImpact: "Doubling conversion rate halves your effective cost per lead.",
            });
          }

          // 5. Bid strategy check
          if (campaign.bidStrategy === "MAXIMUM_DELIVERY") {
            recommendations.push({
              priority: "high",
              category: "Bidding",
              campaign: campaign.id,
              campaignName: campaign.name,
              finding: "Using MAXIMUM_DELIVERY (automated bidding) — LinkedIn controls your bid prices.",
              recommendation:
                "Switch to MANUAL bidding to set CPC/CPM caps. Start with the current average CPC as your manual bid and optimize from there.",
              estimatedImpact: "Manual bidding typically reduces CPC by 15-30% vs automated delivery.",
            });
          }

          // 6. Audience expansion & network
          if (campaign.enableAudienceExpansion) {
            recommendations.push({
              priority: "high",
              category: "Targeting",
              campaign: campaign.id,
              campaignName: campaign.name,
              finding: "Audience expansion is ON — LinkedIn is showing ads to people outside your targeting criteria.",
              recommendation: "Disable audience expansion immediately to prevent budget waste on irrelevant audiences.",
              estimatedImpact: "Typically 10-20% of spend goes to expanded (untargeted) audiences.",
            });
          }
          if (campaign.offsiteDeliveryEnabled) {
            recommendations.push({
              priority: "high",
              category: "Targeting",
              campaign: campaign.id,
              campaignName: campaign.name,
              finding: "LinkedIn Audience Network is ON — ads are being served on third-party sites.",
              recommendation: "Disable Audience Network. Offsite placements have 70-80% lower engagement rates.",
              estimatedImpact: "Redirecting offsite spend to LinkedIn feed placements improves quality significantly.",
            });
          }

          // 7. Creative fatigue detection
          if (stats.dailyData.length >= 14) {
            const firstWeek = stats.dailyData.slice(0, 7);
            const lastWeek = stats.dailyData.slice(-7);
            const firstWeekCtr = computeSliceCtr(firstWeek);
            const lastWeekCtr = computeSliceCtr(lastWeek);
            if (firstWeekCtr > 0 && lastWeekCtr / firstWeekCtr < 0.6) {
              recommendations.push({
                priority: "high",
                category: "Creative",
                campaign: campaign.id,
                campaignName: campaign.name,
                finding: `CTR dropped ${((1 - lastWeekCtr / firstWeekCtr) * 100).toFixed(0)}% from first week to last week — creative fatigue detected.`,
                recommendation:
                  "Rotate in new ad creatives immediately. Test different formats (video, carousel, document ads) to re-engage the audience.",
                estimatedImpact: "Fresh creatives typically restore CTR to near-original levels within 1-2 weeks.",
              });
            }
          }

          // 8. Spend efficiency across campaigns
          if (stats.conversions > 0) {
            const costPerConversion = stats.spend / stats.conversions;
            if (costPerConversion > 150) {
              recommendations.push({
                priority: "medium",
                category: "Budget",
                campaign: campaign.id,
                campaignName: campaign.name,
                finding: `Cost per conversion is $${costPerConversion.toFixed(2)} — consider if this is within acceptable CAC.`,
                recommendation:
                  "Compare against your target CAC. If too high: tighten targeting to higher-intent segments, improve landing page, or test different offers.",
                estimatedImpact: "Reallocating budget from high-CAC to low-CAC campaigns improves overall portfolio efficiency.",
              });
            }
          }
        }

        // ── Cross-campaign recommendations ───────────────────────────

        // Find the best and worst performers for budget reallocation
        const campaignPerformance = campaigns
          .map((c) => {
            const stats = campaignStats.get(c.id);
            if (!stats || stats.impressions === 0) return null;
            return {
              id: c.id,
              name: c.name,
              ctr: (stats.clicks / stats.impressions) * 100,
              cpc: stats.clicks > 0 ? stats.spend / stats.clicks : Infinity,
              conversions: stats.conversions,
              spend: stats.spend,
              costPerConversion: stats.conversions > 0 ? stats.spend / stats.conversions : Infinity,
            };
          })
          .filter(Boolean) as Array<{
            id: string;
            name: string;
            ctr: number;
            cpc: number;
            conversions: number;
            spend: number;
            costPerConversion: number;
          }>;

        if (campaignPerformance.length >= 2) {
          const bestByCtr = [...campaignPerformance].sort((a, b) => b.ctr - a.ctr)[0];
          const worstByCtr = [...campaignPerformance].sort((a, b) => a.ctr - b.ctr)[0];
          if (bestByCtr.ctr > worstByCtr.ctr * 2) {
            recommendations.push({
              priority: "medium",
              category: "Budget Reallocation",
              campaign: "portfolio",
              campaignName: "Cross-campaign",
              finding: `"${bestByCtr.name}" has ${bestByCtr.ctr.toFixed(2)}% CTR vs "${worstByCtr.name}" at ${worstByCtr.ctr.toFixed(2)}%.`,
              recommendation: `Shift budget from "${worstByCtr.name}" to "${bestByCtr.name}" for better overall performance.`,
              estimatedImpact: "Budget reallocation to top performers typically improves portfolio CTR by 15-25%.",
            });
          }
        }

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return {
          accountId: args.accountId || client.config.adAccountId,
          analyzedCampaigns: campaigns.length,
          lookbackDays: args.lookbackDays,
          totalRecommendations: recommendations.length,
          byPriority: {
            high: recommendations.filter((r) => r.priority === "high").length,
            medium: recommendations.filter((r) => r.priority === "medium").length,
            low: recommendations.filter((r) => r.priority === "low").length,
          },
          byCategory: groupByCategory(recommendations),
          recommendations,
        };
      },
    },

    get_quick_wins: {
      description:
        "Get the top 5 highest-impact, easiest-to-implement optimization recommendations. " +
        "These are quick wins that can be applied immediately for fast results.",
      schema: z.object({
        lookbackDays: z.number().default(14),
      }),
      handler: async (args: { lookbackDays: number }) => {
        // Pull active campaigns
        const campaignsPath = client.accountPath("/adCampaigns");
        const campaignsRes = await client.get<{
          elements: Array<{
            id: string;
            name: string;
            status: string;
            enableAudienceExpansion?: boolean;
            offsiteDeliveryEnabled?: boolean;
            bidStrategy?: string;
            dailyBudget?: { amount: string };
          }>;
        }>(campaignsPath, {
          q: "search",
          "search.status.values[0]": "ACTIVE",
        });
        const campaigns = campaignsRes.data.elements || [];

        const quickWins: Array<{
          action: string;
          campaign: string;
          effort: string;
          impact: string;
        }> = [];

        // Instant fixes — no data analysis needed
        for (const c of campaigns) {
          if (c.enableAudienceExpansion) {
            quickWins.push({
              action: `Disable audience expansion on "${c.name}"`,
              campaign: c.id,
              effort: "1 minute — single toggle",
              impact: "Prevents 10-20% budget waste on untargeted audiences",
            });
          }
          if (c.offsiteDeliveryEnabled) {
            quickWins.push({
              action: `Disable Audience Network on "${c.name}"`,
              campaign: c.id,
              effort: "1 minute — single toggle",
              impact: "Redirects spend from low-quality offsite to high-quality LinkedIn feed",
            });
          }
          if (c.bidStrategy === "MAXIMUM_DELIVERY") {
            quickWins.push({
              action: `Switch "${c.name}" from automated to manual bidding`,
              campaign: c.id,
              effort: "5 minutes — set manual bid based on current CPC",
              impact: "Typically reduces CPC by 15-30%",
            });
          }
        }

        return {
          totalQuickWins: quickWins.length,
          quickWins: quickWins.slice(0, 10),
          note: quickWins.length === 0
            ? "No quick wins found — your campaigns are following best practices. Run get_optimization_recommendations for deeper analysis."
            : "These can all be applied immediately. Use update_campaign to make changes.",
        };
      },
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function computeSliceCtr(
  data: Array<{ impressions: number; clicks: number }>
): number {
  const totals = data.reduce(
    (acc, d) => ({
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
    }),
    { impressions: 0, clicks: 0 }
  );
  return totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
}

function groupByCategory(
  recs: Recommendation[]
): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const r of recs) {
    groups[r.category] = (groups[r.category] || 0) + 1;
  }
  return groups;
}
