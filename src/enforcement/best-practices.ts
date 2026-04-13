/**
 * Best-practice enforcement layer.
 * Automatically applied to every campaign create/update to prevent budget waste.
 *
 * Rules:
 *  1. Audience Expansion → always OFF
 *  2. Audience Network (offsite delivery) → always OFF
 *  3. Bid strategy defaults to MANUAL (warns if MAXIMUM_DELIVERY is used)
 *  4. Daily budget floor check ($10 minimum to avoid delivery issues)
 *  5. Objective + cost type compatibility validation
 */

export interface EnforcementResult {
  _enforced?: string[];
  _warnings?: string[];
  [key: string]: unknown;
}

const OBJECTIVE_COST_TYPE_MAP: Record<string, string[]> = {
  BRAND_AWARENESS: ["CPM"],
  ENGAGEMENT: ["CPM", "CPC"],
  VIDEO_VIEWS: ["CPV", "CPM"],
  LEAD_GENERATION: ["CPM", "CPC"],
  WEBSITE_VISITS: ["CPC", "CPM"],
  WEBSITE_CONVERSIONS: ["CPC", "CPM"],
  JOB_APPLICANTS: ["CPC", "CPM"],
};

const MIN_DAILY_BUDGET_USD = "10";

export function enforceBestPractices(
  payload: Record<string, unknown>
): Record<string, unknown> & EnforcementResult {
  const enforced: string[] = [];
  const warnings: string[] = [];
  const result = { ...payload };

  // ── Rule 1: Force audience expansion OFF ──────────────────────
  if (result.enableAudienceExpansion !== false) {
    result.enableAudienceExpansion = false;
    enforced.push(
      "enableAudienceExpansion set to false — audience expansion wastes budget on untargeted reach"
    );
  }

  // ── Rule 2: Force audience network (offsite delivery) OFF ─────
  if (result.offsiteDeliveryEnabled !== false) {
    result.offsiteDeliveryEnabled = false;
    enforced.push(
      "offsiteDeliveryEnabled set to false — LinkedIn Audience Network delivers low-quality placements"
    );
  }

  // ── Rule 3: Bid strategy validation ───────────────────────────
  if (result.bidStrategy === "MAXIMUM_DELIVERY") {
    warnings.push(
      "MAXIMUM_DELIVERY (automated bidding) detected — this gives LinkedIn full bid control " +
        "and often overspends. Consider switching to MANUAL bidding for cost control."
    );
  }
  if (!result.bidStrategy) {
    result.bidStrategy = "MANUAL";
    enforced.push("bidStrategy defaulted to MANUAL for cost control");
  }

  // ── Rule 4: Daily budget floor ────────────────────────────────
  const dailyBudget = result.dailyBudget as
    | { amount: string; currencyCode: string }
    | undefined;
  if (dailyBudget && parseFloat(dailyBudget.amount) < parseFloat(MIN_DAILY_BUDGET_USD)) {
    warnings.push(
      `Daily budget $${dailyBudget.amount} is below the $${MIN_DAILY_BUDGET_USD} minimum — ` +
        "LinkedIn may not deliver at this level."
    );
  }

  // ── Rule 5: Objective + cost type compatibility ───────────────
  const objective = result.objectiveType as string | undefined;
  const costType = result.costType as string | undefined;
  if (objective && costType) {
    const allowed = OBJECTIVE_COST_TYPE_MAP[objective];
    if (allowed && !allowed.includes(costType)) {
      warnings.push(
        `Cost type "${costType}" is not recommended for objective "${objective}". ` +
          `Recommended: ${allowed.join(" or ")}.`
      );
    }
  }

  result._enforced = enforced;
  result._warnings = warnings;
  return result;
}

/**
 * Validate that a campaign group doesn't mix objectives.
 * Called before adding a campaign to a group.
 */
export function validateObjectiveConsistency(
  existingObjectives: string[],
  newObjective: string
): { valid: boolean; message?: string } {
  const unique = new Set(existingObjectives);
  if (unique.size === 0) return { valid: true };
  if (unique.has(newObjective)) return { valid: true };
  return {
    valid: false,
    message:
      `Campaign group already contains campaigns with objective(s): ` +
      `${[...unique].join(", ")}. Adding "${newObjective}" would mix objectives. ` +
      `Create a separate campaign group for this objective.`,
  };
}

/**
 * Validate budget type consistency within a campaign group.
 * A group should use either totalBudget OR dailyBudget, not both.
 */
export function validateBudgetConsistency(group: {
  totalBudget?: unknown;
  dailyBudget?: unknown;
}): { valid: boolean; message?: string } {
  if (group.totalBudget && group.dailyBudget) {
    return {
      valid: false,
      message:
        "Cannot set both totalBudget and dailyBudget on a campaign group. " +
        "Use totalBudget for lifetime budgets or dailyBudget for ongoing spend control.",
    };
  }
  return { valid: true };
}
