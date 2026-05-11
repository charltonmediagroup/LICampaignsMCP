/**
 * Industry benchmarking tools — compare campaign performance against LinkedIn industry averages.
 *
 * Benchmark data sourced from LinkedIn's published advertising benchmarks and
 * aggregated industry reports. Updated periodically.
 */

import { z } from "zod";
import type { LinkedInClient } from "../linkedin/client.js";

// ─── Industry Benchmark Data ───────────────────────────────────────
// Sources: LinkedIn Business, Metadata.io, Databox aggregated reports
// These are median values across advertisers in each vertical.

export interface IndustryBenchmark {
  ctr: number;        // Click-through rate (%)
  cpc: number;        // Cost per click (USD)
  cpm: number;        // Cost per 1000 impressions (USD)
  conversionRate: number; // Landing page conversion rate (%)
  engagementRate: number; // Engagement rate (%)
  costPerLead: number;    // Cost per lead (USD)
}

const INDUSTRY_BENCHMARKS: Record<string, IndustryBenchmark> = {
  "Technology / Software": {
    ctr: 0.44, cpc: 5.58, cpm: 33.36, conversionRate: 2.31, engagementRate: 0.68, costPerLead: 75.00,
  },
  "Financial Services": {
    ctr: 0.38, cpc: 6.85, cpm: 38.40, conversionRate: 2.04, engagementRate: 0.56, costPerLead: 90.00,
  },
  "Healthcare / Pharma": {
    ctr: 0.40, cpc: 5.24, cpm: 31.00, conversionRate: 2.10, engagementRate: 0.60, costPerLead: 85.00,
  },
  "Education": {
    ctr: 0.42, cpc: 4.72, cpm: 27.60, conversionRate: 2.45, engagementRate: 0.72, costPerLead: 65.00,
  },
  "Manufacturing / Industrial": {
    ctr: 0.35, cpc: 5.10, cpm: 30.20, conversionRate: 1.85, engagementRate: 0.52, costPerLead: 80.00,
  },
  "Professional Services": {
    ctr: 0.40, cpc: 5.95, cpm: 35.00, conversionRate: 2.20, engagementRate: 0.62, costPerLead: 78.00,
  },
  "Media / Publishing": {
    ctr: 0.48, cpc: 4.20, cpm: 25.80, conversionRate: 2.50, engagementRate: 0.80, costPerLead: 55.00,
  },
  "Retail / E-commerce": {
    ctr: 0.39, cpc: 5.30, cpm: 32.00, conversionRate: 2.15, engagementRate: 0.58, costPerLead: 70.00,
  },
  "Real Estate": {
    ctr: 0.37, cpc: 5.65, cpm: 33.80, conversionRate: 1.95, engagementRate: 0.54, costPerLead: 82.00,
  },
  "Telecommunications": {
    ctr: 0.36, cpc: 6.20, cpm: 36.50, conversionRate: 1.90, engagementRate: 0.50, costPerLead: 88.00,
  },
  "Energy / Utilities": {
    ctr: 0.33, cpc: 6.40, cpm: 37.00, conversionRate: 1.80, engagementRate: 0.48, costPerLead: 92.00,
  },
  "Hospitality / Travel": {
    ctr: 0.43, cpc: 4.50, cpm: 28.00, conversionRate: 2.30, engagementRate: 0.70, costPerLead: 60.00,
  },
  "Government / Public Sector": {
    ctr: 0.34, cpc: 5.80, cpm: 34.00, conversionRate: 1.75, engagementRate: 0.46, costPerLead: 95.00,
  },
  "Non-Profit": {
    ctr: 0.41, cpc: 4.00, cpm: 24.50, conversionRate: 2.40, engagementRate: 0.74, costPerLead: 50.00,
  },
  "All Industries (Average)": {
    ctr: 0.39, cpc: 5.39, cpm: 33.80, conversionRate: 2.14, engagementRate: 0.60, costPerLead: 75.00,
  },
};

// ─── Ad format benchmarks ──────────────────────────────────────────

const FORMAT_BENCHMARKS: Record<string, { ctr: number; engagementRate: number; cpc: number }> = {
  "Single Image Ad": { ctr: 0.44, engagementRate: 0.56, cpc: 5.58 },
  "Carousel Ad": { ctr: 0.40, engagementRate: 0.65, cpc: 5.25 },
  "Video Ad": { ctr: 0.37, engagementRate: 0.75, cpc: 6.20 },
  "Message Ad (InMail)": { ctr: 3.20, engagementRate: 3.20, cpc: 0.80 },
  "Text Ad": { ctr: 0.02, engagementRate: 0.02, cpc: 3.50 },
  "Document Ad": { ctr: 0.48, engagementRate: 0.82, cpc: 4.80 },
  "Conversation Ad": { ctr: 4.50, engagementRate: 4.50, cpc: 0.65 },
};

// ─── Helpers ───────────────────────────────────────────────────────

function ratingLabel(ratio: number): string {
  if (ratio >= 1.3) return "Excellent — well above benchmark";
  if (ratio >= 1.0) return "Good — at or above benchmark";
  if (ratio >= 0.7) return "Below average — room for improvement";
  return "Poor — significantly below benchmark";
}

function costRatingLabel(ratio: number): string {
  // For cost metrics, lower is better, so invert the logic
  if (ratio <= 0.7) return "Excellent — well below benchmark cost";
  if (ratio <= 1.0) return "Good — at or below benchmark cost";
  if (ratio <= 1.3) return "Above average cost — room for optimization";
  return "Poor — significantly above benchmark cost";
}

// ─── Tools ─────────────────────────────────────────────────────────

export function registerBenchmarkTools(client: LinkedInClient) {
  return {
    benchmark_campaign_performance: {
      description:
        "Compare campaign performance metrics against LinkedIn industry benchmarks. " +
        "Shows how your CTR, CPC, CPM, conversion rate, and engagement rate stack up " +
        "against industry averages. Provides a rating and actionable recommendations.",
      schema: z.object({
        campaignIds: z.array(z.string()).describe("Campaign URNs to benchmark"),
        dateRange: z.object({
          startDate: z.string().describe("Start date YYYY-MM-DD"),
          endDate: z.string().describe("End date YYYY-MM-DD"),
        }),
        industry: z
          .string()
          .optional()
          .describe(
            "Industry to benchmark against. Options: Technology / Software, Financial Services, " +
            "Healthcare / Pharma, Education, Manufacturing / Industrial, Professional Services, " +
            "Media / Publishing, Retail / E-commerce, Real Estate, Telecommunications, " +
            "Energy / Utilities, Hospitality / Travel, Government / Public Sector, Non-Profit. " +
            "Defaults to All Industries (Average)."
          ),
      }),
      handler: async (args: {
        campaignIds: string[];
        dateRange: { startDate: string; endDate: string };
        industry?: string;
      }) => {
        const industry = args.industry || "All Industries (Average)";
        const benchmark = INDUSTRY_BENCHMARKS[industry];
        if (!benchmark) {
          return {
            error: `Unknown industry "${industry}". Available: ${Object.keys(INDUSTRY_BENCHMARKS).join(", ")}`,
          };
        }

        const [startYear, startMonth, startDay] = args.dateRange.startDate.split("-");
        const [endYear, endMonth, endDay] = args.dateRange.endDate.split("-");

        const params: Record<string, string> = {
          q: "analytics",
          pivot: "CAMPAIGN",
          timeGranularity: "ALL",
          "dateRange.start.year": startYear,
          "dateRange.start.month": startMonth,
          "dateRange.start.day": startDay,
          "dateRange.end.year": endYear,
          "dateRange.end.month": endMonth,
          "dateRange.end.day": endDay,
          fields:
            "impressions,clicks,costInLocalCurrency,conversions,externalWebsiteConversions,likes,comments,shares,follows",
        };
        args.campaignIds.forEach((id, i) => {
          params[`campaigns[${i}]`] = id;
        });

        const res = await client.get<{ elements: Array<Record<string, unknown>> }>(
          "/adAnalytics",
          params
        );
        const elements = res.data.elements || [];

        // Aggregate across all campaigns
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalSpend = 0;
        let totalConversions = 0;
        let totalEngagements = 0;

        for (const el of elements) {
          totalImpressions += Number(el.impressions) || 0;
          totalClicks += Number(el.clicks) || 0;
          totalSpend += Number(el.costInLocalCurrency) || 0;
          totalConversions +=
            (Number(el.conversions) || 0) +
            (Number(el.externalWebsiteConversions) || 0);
          totalEngagements +=
            (Number(el.clicks) || 0) +
            (Number(el.likes) || 0) +
            (Number(el.comments) || 0) +
            (Number(el.shares) || 0) +
            (Number(el.follows) || 0);
        }

        const yourCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const yourCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
        const yourCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
        const yourConversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
        const yourEngagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0;
        const yourCostPerLead = totalConversions > 0 ? totalSpend / totalConversions : 0;

        const metrics = [
          {
            metric: "CTR (%)",
            yours: yourCtr.toFixed(2),
            benchmark: benchmark.ctr.toFixed(2),
            ratio: benchmark.ctr > 0 ? yourCtr / benchmark.ctr : 0,
            rating: ratingLabel(benchmark.ctr > 0 ? yourCtr / benchmark.ctr : 0),
            higherIsBetter: true,
          },
          {
            metric: "CPC ($)",
            yours: yourCpc.toFixed(2),
            benchmark: benchmark.cpc.toFixed(2),
            ratio: benchmark.cpc > 0 ? yourCpc / benchmark.cpc : 0,
            rating: costRatingLabel(benchmark.cpc > 0 ? yourCpc / benchmark.cpc : 0),
            higherIsBetter: false,
          },
          {
            metric: "CPM ($)",
            yours: yourCpm.toFixed(2),
            benchmark: benchmark.cpm.toFixed(2),
            ratio: benchmark.cpm > 0 ? yourCpm / benchmark.cpm : 0,
            rating: costRatingLabel(benchmark.cpm > 0 ? yourCpm / benchmark.cpm : 0),
            higherIsBetter: false,
          },
          {
            metric: "Conversion Rate (%)",
            yours: yourConversionRate.toFixed(2),
            benchmark: benchmark.conversionRate.toFixed(2),
            ratio: benchmark.conversionRate > 0 ? yourConversionRate / benchmark.conversionRate : 0,
            rating: ratingLabel(benchmark.conversionRate > 0 ? yourConversionRate / benchmark.conversionRate : 0),
            higherIsBetter: true,
          },
          {
            metric: "Engagement Rate (%)",
            yours: yourEngagementRate.toFixed(2),
            benchmark: benchmark.engagementRate.toFixed(2),
            ratio: benchmark.engagementRate > 0 ? yourEngagementRate / benchmark.engagementRate : 0,
            rating: ratingLabel(benchmark.engagementRate > 0 ? yourEngagementRate / benchmark.engagementRate : 0),
            higherIsBetter: true,
          },
          {
            metric: "Cost Per Lead ($)",
            yours: yourCostPerLead.toFixed(2),
            benchmark: benchmark.costPerLead.toFixed(2),
            ratio: benchmark.costPerLead > 0 ? yourCostPerLead / benchmark.costPerLead : 0,
            rating: costRatingLabel(benchmark.costPerLead > 0 ? yourCostPerLead / benchmark.costPerLead : 0),
            higherIsBetter: false,
          },
        ];

        // Overall score: average of normalized ratios (capped at 2x)
        const scores = metrics.map((m) => {
          const raw = m.ratio;
          const normalized = m.higherIsBetter ? Math.min(raw, 2) : Math.min(2 - raw, 2);
          return Math.max(normalized, 0);
        });
        const overallScore = Math.round(
          (scores.reduce((a, b) => a + b, 0) / scores.length) * 50
        );

        // Recommendations
        const recommendations: string[] = [];
        if (yourCtr < benchmark.ctr) {
          recommendations.push(
            "CTR is below benchmark — test stronger headlines, clearer CTAs, and more specific targeting."
          );
        }
        if (yourCpc > benchmark.cpc * 1.3) {
          recommendations.push(
            "CPC is significantly above benchmark — review bid strategy, narrow audience to reduce competition, or improve ad relevance."
          );
        }
        if (yourConversionRate < benchmark.conversionRate) {
          recommendations.push(
            "Conversion rate is below benchmark — optimize landing pages, ensure message match between ad and landing page."
          );
        }
        if (yourEngagementRate < benchmark.engagementRate) {
          recommendations.push(
            "Engagement rate is below benchmark — try more visual formats (video, carousel), ask questions, or use more compelling content."
          );
        }
        if (yourCostPerLead > benchmark.costPerLead * 1.3 && totalConversions > 0) {
          recommendations.push(
            "Cost per lead is high — consider lead gen forms (pre-filled from LinkedIn profiles) to reduce friction."
          );
        }
        if (recommendations.length === 0) {
          recommendations.push(
            "Performance is at or above industry benchmarks across the board. Continue current strategy and test incrementally."
          );
        }

        return {
          industry,
          campaignsAnalyzed: args.campaignIds.length,
          dateRange: args.dateRange,
          totals: {
            impressions: totalImpressions,
            clicks: totalClicks,
            spend: totalSpend.toFixed(2),
            conversions: totalConversions,
          },
          overallScore: `${overallScore}/100`,
          metrics,
          recommendations,
        };
      },
    },

    list_industry_benchmarks: {
      description:
        "List LinkedIn advertising benchmarks for all industries or a specific one. " +
        "Shows CTR, CPC, CPM, conversion rate, engagement rate, and cost per lead.",
      schema: z.object({
        industry: z
          .string()
          .optional()
          .describe("Specific industry name, or omit for all industries"),
      }),
      handler: async (args: { industry?: string }) => {
        if (args.industry) {
          const benchmark = INDUSTRY_BENCHMARKS[args.industry];
          if (!benchmark) {
            return {
              error: `Unknown industry "${args.industry}". Available: ${Object.keys(INDUSTRY_BENCHMARKS).join(", ")}`,
            };
          }
          return { industry: args.industry, benchmarks: benchmark };
        }
        return {
          industries: Object.entries(INDUSTRY_BENCHMARKS).map(
            ([name, data]) => ({ industry: name, ...data })
          ),
          adFormats: Object.entries(FORMAT_BENCHMARKS).map(
            ([name, data]) => ({ format: name, ...data })
          ),
        };
      },
    },
  };
}
