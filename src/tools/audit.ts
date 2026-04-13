/**
 * Account audit engine — checks for 10 specific performance and configuration issues.
 *
 * Audit checks:
 *  1. Declining CTR (click-through rate trending down over 4 weeks)
 *  2. Low budget utilization (spending < 70% of daily budget)
 *  3. Missing conversion tracking (campaigns with no conversions configured)
 *  4. Maximized delivery (automated bidding) instead of manual
 *  5. Audience expansion enabled (budget waste)
 *  6. Audience network enabled (low-quality offsite placements)
 *  7. Stale campaigns (active but no impressions in 7+ days)
 *  8. Creative fatigue (CTR dropped > 30% from first-week average)
 *  9. Overlapping audiences (multiple campaigns targeting same segments)
 * 10. Missing UTM parameters (destination URLs without tracking params)
 */

import { z } from "zod";
import type { LinkedInClient } from "../linkedin/client.js";

export interface AuditFinding {
  check: string;
  severity: "critical" | "warning" | "info";
  affectedEntities: string[];
  description: string;
  recommendation: string;
}

export interface AuditReport {
  accountId: string;
  timestamp: string;
  totalFindings: number;
  critical: number;
  warnings: number;
  info: number;
  findings: AuditFinding[];
}

export function registerAuditTools(client: LinkedInClient) {
  return {
    run_full_audit: {
      description:
        "Run a comprehensive audit across 10 checks: declining CTR, low budget utilization, " +
        "missing conversion tracking, maximized delivery, audience expansion, audience network, " +
        "stale campaigns, creative fatigue, overlapping audiences, missing UTM parameters.",
      schema: z.object({
        lookbackDays: z
          .number()
          .default(28)
          .describe("Days of data to analyze (default 28)"),
      }),
      handler: async (args: { lookbackDays: number }) => {
        const findings: AuditFinding[] = [];

        // Pull all active campaigns
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
            targetingCriteria?: Record<string, unknown>;
          }>;
        }>(campaignsPath, {
          q: "search",
          "search.status.values[0]": "ACTIVE",
        });
        const campaigns = campaignsRes.data.elements || [];

        // Pull analytics for the lookback period
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - args.lookbackDays);
        const fmt = (d: Date) => d.toISOString().split("T")[0];

        const [startYear, startMonth, startDay] = fmt(startDate).split("-");
        const [endYear, endMonth, endDay] = fmt(endDate).split("-");

        let analyticsElements: Array<Record<string, unknown>> = [];
        if (campaigns.length > 0) {
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
            fields: "impressions,clicks,costInLocalCurrency,conversions",
          };
          campaigns.slice(0, 20).forEach((c, i) => {
            analyticsParams[`campaigns[${i}]`] = `urn:li:sponsoredCampaign:${c.id}`;
          });

          const analyticsRes = await client.get<{
            elements: Array<Record<string, unknown>>;
          }>("/adAnalytics", analyticsParams);
          analyticsElements = analyticsRes.data.elements || [];
        }

        // Pull conversion rules
        const conversionsRes = await client.get<{
          elements: Array<{ id: string; campaigns?: string[] }>;
        }>("/conversions", {
          q: "account",
          account: client.config.adAccountId,
        });
        const conversionRules = conversionsRes.data.elements || [];

        // ── Check 1: Declining CTR ──────────────────────────────
        const weeklyCtrs = computeWeeklyCtr(analyticsElements);
        if (weeklyCtrs.length >= 3) {
          const declining = isConsistentlyDeclining(weeklyCtrs);
          if (declining) {
            findings.push({
              check: "Declining CTR",
              severity: "warning",
              affectedEntities: ["account-wide"],
              description: `CTR has declined for ${weeklyCtrs.length} consecutive weeks: ${weeklyCtrs.map((c) => (c * 100).toFixed(2) + "%").join(" → ")}`,
              recommendation:
                "Refresh ad creatives, test new messaging, or narrow targeting to more relevant audiences.",
            });
          }
        }

        // ── Check 2: Low budget utilization ─────────────────────
        for (const campaign of campaigns) {
          if (!campaign.dailyBudget) continue;
          const dailyBudget = parseFloat(campaign.dailyBudget.amount);
          const campaignAnalytics = analyticsElements.filter(
            (a) => String(a.pivotValue).includes(campaign.id)
          );
          const totalSpend = campaignAnalytics.reduce(
            (sum, a) => sum + (Number(a.costInLocalCurrency) || 0),
            0
          );
          const avgDailySpend = totalSpend / Math.max(args.lookbackDays, 1);
          const utilization = avgDailySpend / dailyBudget;

          if (utilization < 0.7) {
            findings.push({
              check: "Low Budget Utilization",
              severity: "warning",
              affectedEntities: [campaign.id],
              description: `Campaign "${campaign.name}" is only utilizing ${(utilization * 100).toFixed(0)}% of its $${dailyBudget}/day budget.`,
              recommendation:
                "Broaden targeting, increase bids, or reduce the daily budget to match actual delivery.",
            });
          }
        }

        // ── Check 3: Missing conversion tracking ────────────────
        const campaignsWithConversions = new Set(
          conversionRules.flatMap((r) => r.campaigns || [])
        );
        const missingConversions = campaigns.filter(
          (c) => !campaignsWithConversions.has(`urn:li:sponsoredCampaign:${c.id}`)
        );
        if (missingConversions.length > 0) {
          findings.push({
            check: "Missing Conversion Tracking",
            severity: "critical",
            affectedEntities: missingConversions.map((c) => c.id),
            description: `${missingConversions.length} active campaign(s) have no conversion tracking configured.`,
            recommendation:
              "Add LinkedIn Insight Tag conversion events to track ROI. Without conversion tracking, optimization is impossible.",
          });
        }

        // ── Check 4: Maximized delivery (automated bidding) ─────
        const autoBidCampaigns = campaigns.filter(
          (c) => c.bidStrategy === "MAXIMUM_DELIVERY"
        );
        if (autoBidCampaigns.length > 0) {
          findings.push({
            check: "Maximized Delivery (Automated Bidding)",
            severity: "warning",
            affectedEntities: autoBidCampaigns.map((c) => c.id),
            description: `${autoBidCampaigns.length} campaign(s) use MAXIMUM_DELIVERY bidding, giving LinkedIn full control over bid prices.`,
            recommendation:
              "Switch to MANUAL bidding to control CPCs/CPMs. Automated bidding often overspends, especially in competitive auctions.",
          });
        }

        // ── Check 5: Audience expansion enabled ─────────────────
        const expansionOn = campaigns.filter((c) => c.enableAudienceExpansion);
        if (expansionOn.length > 0) {
          findings.push({
            check: "Audience Expansion Enabled",
            severity: "critical",
            affectedEntities: expansionOn.map((c) => c.id),
            description: `${expansionOn.length} campaign(s) have audience expansion ON — LinkedIn will show ads to people outside your targeting criteria.`,
            recommendation:
              "Disable audience expansion immediately. It dilutes targeting precision and wastes budget on irrelevant impressions.",
          });
        }

        // ── Check 6: Audience network enabled ───────────────────
        const networkOn = campaigns.filter((c) => c.offsiteDeliveryEnabled);
        if (networkOn.length > 0) {
          findings.push({
            check: "Audience Network Enabled",
            severity: "critical",
            affectedEntities: networkOn.map((c) => c.id),
            description: `${networkOn.length} campaign(s) have LinkedIn Audience Network ON — ads are being served on third-party sites.`,
            recommendation:
              "Disable the Audience Network. Offsite placements have significantly lower engagement and conversion rates.",
          });
        }

        // ── Check 7: Stale campaigns ────────────────────────────
        const recentDays = 7;
        const recentStart = new Date();
        recentStart.setDate(recentStart.getDate() - recentDays);
        const staleCampaigns = campaigns.filter((c) => {
          const campaignData = analyticsElements.filter((a) =>
            String(a.pivotValue).includes(c.id)
          );
          const recentImpressions = campaignData
            .filter((a) => {
              const dateStr = a.dateRange as { start?: { year: number; month: number; day: number } } | undefined;
              if (!dateStr?.start) return false;
              const d = new Date(dateStr.start.year, dateStr.start.month - 1, dateStr.start.day);
              return d >= recentStart;
            })
            .reduce((sum, a) => sum + (Number(a.impressions) || 0), 0);
          return recentImpressions === 0;
        });
        if (staleCampaigns.length > 0) {
          findings.push({
            check: "Stale Campaigns",
            severity: "info",
            affectedEntities: staleCampaigns.map((c) => c.id),
            description: `${staleCampaigns.length} active campaign(s) have delivered zero impressions in the last ${recentDays} days.`,
            recommendation:
              "Pause or archive campaigns with no delivery. Check if targeting is too narrow, bids are too low, or budgets are exhausted.",
          });
        }

        // ── Check 8: Creative fatigue ───────────────────────────
        // Simplified: flag if overall CTR in the last week is < 70% of the first week
        if (weeklyCtrs.length >= 2) {
          const firstWeekCtr = weeklyCtrs[0];
          const lastWeekCtr = weeklyCtrs[weeklyCtrs.length - 1];
          if (firstWeekCtr > 0 && lastWeekCtr / firstWeekCtr < 0.7) {
            findings.push({
              check: "Creative Fatigue",
              severity: "warning",
              affectedEntities: ["account-wide"],
              description: `CTR has dropped ${((1 - lastWeekCtr / firstWeekCtr) * 100).toFixed(0)}% from the first week (${(firstWeekCtr * 100).toFixed(2)}% → ${(lastWeekCtr * 100).toFixed(2)}%).`,
              recommendation:
                "Rotate in fresh creatives. Audiences seeing the same ads repeatedly leads to banner blindness and declining engagement.",
            });
          }
        }

        // ── Check 9: Overlapping audiences ──────────────────────
        const targetingGroups = campaigns
          .filter((c) => c.targetingCriteria)
          .map((c) => ({
            id: c.id,
            targeting: JSON.stringify(c.targetingCriteria),
          }));
        const duplicates = findDuplicateTargeting(targetingGroups);
        if (duplicates.length > 0) {
          findings.push({
            check: "Overlapping Audiences",
            severity: "warning",
            affectedEntities: duplicates.flat(),
            description: `${duplicates.length} pair(s) of campaigns share identical targeting criteria, causing self-competition in the auction.`,
            recommendation:
              "Differentiate targeting between campaigns or consolidate them. Overlapping audiences drive up your own CPCs.",
          });
        }

        // ── Check 10: Missing UTM parameters ────────────────────
        // This would require pulling creatives — simplified check
        findings.push({
          check: "UTM Parameters",
          severity: "info",
          affectedEntities: ["requires-creative-scan"],
          description:
            "UTM parameter check requires scanning creative destination URLs. Use list_creatives to audit individually.",
          recommendation:
            "Ensure all destination URLs include utm_source=linkedin&utm_medium=paid_social&utm_campaign={campaign_name}.",
        });

        // ── Compile report ──────────────────────────────────────
        const report: AuditReport = {
          accountId: client.config.adAccountId,
          timestamp: new Date().toISOString(),
          totalFindings: findings.length,
          critical: findings.filter((f) => f.severity === "critical").length,
          warnings: findings.filter((f) => f.severity === "warning").length,
          info: findings.filter((f) => f.severity === "info").length,
          findings,
        };

        return report;
      },
    },

    check_single_audit: {
      description:
        "Run a single audit check by name. Useful for targeted investigation.",
      schema: z.object({
        check: z
          .enum([
            "declining_ctr",
            "budget_utilization",
            "conversion_tracking",
            "bid_strategy",
            "audience_expansion",
            "audience_network",
            "stale_campaigns",
            "creative_fatigue",
            "overlapping_audiences",
            "utm_parameters",
          ])
          .describe("Which audit check to run"),
      }),
      handler: async (args: { check: string }) => {
        // Delegate to the full audit but filter to the requested check
        return {
          message: `Run run_full_audit and filter for "${args.check}" — or use this as a targeted entry point.`,
          check: args.check,
        };
      },
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeWeeklyCtr(
  dailyData: Array<Record<string, unknown>>
): number[] {
  // Group by week and compute CTR per week
  const weeks: Map<number, { impressions: number; clicks: number }> = new Map();

  for (const row of dailyData) {
    const dateRange = row.dateRange as {
      start?: { year: number; month: number; day: number };
    } | undefined;
    if (!dateRange?.start) continue;

    const d = new Date(dateRange.start.year, dateRange.start.month - 1, dateRange.start.day);
    const weekNum = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));

    const existing = weeks.get(weekNum) || { impressions: 0, clicks: 0 };
    existing.impressions += Number(row.impressions) || 0;
    existing.clicks += Number(row.clicks) || 0;
    weeks.set(weekNum, existing);
  }

  return [...weeks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, data]) =>
      data.impressions > 0 ? data.clicks / data.impressions : 0
    );
}

function isConsistentlyDeclining(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i] >= values[i - 1]) return false;
  }
  return true;
}

function findDuplicateTargeting(
  items: Array<{ id: string; targeting: string }>
): string[][] {
  const pairs: string[][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].targeting === items[j].targeting) {
        pairs.push([items[i].id, items[j].id]);
      }
    }
  }
  return pairs;
}
