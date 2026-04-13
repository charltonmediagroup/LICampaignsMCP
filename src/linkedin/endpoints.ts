/**
 * LinkedIn Marketing API endpoint registry.
 * Organized by domain — covers the ~120 endpoints in the Marketing API.
 * Each entry maps a logical name to its REST path and HTTP method.
 */

export interface EndpointDef {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
}

// Helper to inject the ad account URN into paths
export function withAccount(path: string, accountUrn: string): string {
  return path.replace("{accountUrn}", encodeURIComponent(accountUrn));
}

// ─── Account & Organization ──────────────────────────────────────────

export const ACCOUNT_ENDPOINTS = {
  getAdAccounts: {
    method: "GET",
    path: "/adAccounts",
    description: "List all ad accounts the authenticated user can access",
  },
  getAdAccount: {
    method: "GET",
    path: "/adAccounts/{id}",
    description: "Get a single ad account by ID",
  },
  getAdAccountUsers: {
    method: "GET",
    path: "/adAccountUsers",
    description: "List users with access to an ad account",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Campaign Groups ────────────────────────────────────────────────

export const CAMPAIGN_GROUP_ENDPOINTS = {
  listCampaignGroups: {
    method: "GET",
    path: "/adAccounts/{adAccountId}/adCampaignGroups",
    description: "List all campaign groups in the account",
  },
  getCampaignGroup: {
    method: "GET",
    path: "/adAccounts/{adAccountId}/adCampaignGroups/{id}",
    description: "Get a single campaign group",
  },
  createCampaignGroup: {
    method: "POST",
    path: "/adAccounts/{adAccountId}/adCampaignGroups",
    description: "Create a new campaign group",
  },
  updateCampaignGroup: {
    method: "PATCH",
    path: "/adAccounts/{adAccountId}/adCampaignGroups/{id}",
    description: "Update a campaign group",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Campaigns ──────────────────────────────────────────────────────

export const CAMPAIGN_ENDPOINTS = {
  listCampaigns: {
    method: "GET",
    path: "/adAccounts/{adAccountId}/adCampaigns",
    description: "List all campaigns in the account",
  },
  getCampaign: {
    method: "GET",
    path: "/adAccounts/{adAccountId}/adCampaigns/{id}",
    description: "Get a single campaign",
  },
  createCampaign: {
    method: "POST",
    path: "/adAccounts/{adAccountId}/adCampaigns",
    description: "Create a new campaign",
  },
  updateCampaign: {
    method: "PATCH",
    path: "/adAccounts/{adAccountId}/adCampaigns/{id}",
    description: "Update a campaign",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Creatives & Ads ────────────────────────────────────────────────

export const CREATIVE_ENDPOINTS = {
  listCreatives: {
    method: "GET",
    path: "/creatives",
    description: "List creatives in the account",
  },
  getCreative: {
    method: "GET",
    path: "/creatives/{id}",
    description: "Get a single creative",
  },
  createCreative: {
    method: "POST",
    path: "/creatives",
    description: "Create a new creative",
  },
  updateCreative: {
    method: "PATCH",
    path: "/creatives/{id}",
    description: "Update a creative",
  },
  // Legacy ad endpoints
  listAdCreatives: {
    method: "GET",
    path: "/adCreatives",
    description: "List ad creatives (legacy)",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Media / Image & Video Upload ───────────────────────────────────

export const MEDIA_ENDPOINTS = {
  registerUpload: {
    method: "POST",
    path: "/assets?action=registerUpload",
    description: "Register an image/video upload and get an upload URL",
  },
  completeUpload: {
    method: "POST",
    path: "/assets?action=completeMultiPartUpload",
    description: "Finalize a multi-part video upload",
  },
  getAsset: {
    method: "GET",
    path: "/assets/{id}",
    description: "Check upload/processing status of an asset",
  },
  listImages: {
    method: "GET",
    path: "/images",
    description: "List images in the account media library",
  },
  listVideos: {
    method: "GET",
    path: "/videos",
    description: "List videos in the account media library",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Targeting / Audiences ──────────────────────────────────────────

export const AUDIENCE_ENDPOINTS = {
  listSavedAudiences: {
    method: "GET",
    path: "/dmpSegments",
    description: "List saved/matched audiences",
  },
  getSavedAudience: {
    method: "GET",
    path: "/dmpSegments/{id}",
    description: "Get a single saved audience",
  },
  createSavedAudience: {
    method: "POST",
    path: "/dmpSegments",
    description: "Create a new saved audience",
  },
  updateSavedAudience: {
    method: "PATCH",
    path: "/dmpSegments/{id}",
    description: "Update a saved audience",
  },
  deleteSavedAudience: {
    method: "DELETE",
    path: "/dmpSegments/{id}",
    description: "Delete a saved audience",
  },
  // Targeting facets
  getTargetingFacets: {
    method: "GET",
    path: "/adTargetingFacets",
    description: "List available targeting facets",
  },
  searchTargetingEntities: {
    method: "GET",
    path: "/adTargetingEntities",
    description: "Search targeting entities (companies, titles, skills, etc.)",
  },
  getAudienceCounts: {
    method: "GET",
    path: "/adTargetingAnalytics",
    description: "Get estimated audience size for targeting criteria",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Conversions ────────────────────────────────────────────────────

export const CONVERSION_ENDPOINTS = {
  listConversions: {
    method: "GET",
    path: "/conversions",
    description: "List conversion rules",
  },
  getConversion: {
    method: "GET",
    path: "/conversions/{id}",
    description: "Get a single conversion rule",
  },
  createConversion: {
    method: "POST",
    path: "/conversions",
    description: "Create a conversion rule",
  },
  updateConversion: {
    method: "PATCH",
    path: "/conversions/{id}",
    description: "Update a conversion rule",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Reporting & Analytics ──────────────────────────────────────────

export const ANALYTICS_ENDPOINTS = {
  adAnalytics: {
    method: "GET",
    path: "/adAnalytics",
    description: "Pull campaign/creative performance analytics",
  },
  adBudgetPricing: {
    method: "GET",
    path: "/adBudgetPricing",
    description: "Get budget and pricing recommendations",
  },
  adForecast: {
    method: "GET",
    path: "/adForecast",
    description: "Forecast campaign reach and performance",
  },
  reachFrequency: {
    method: "GET",
    path: "/adAnalytics?q=reachFrequency",
    description: "Get reach and frequency metrics",
  },
  brandLift: {
    method: "GET",
    path: "/brandLiftAnalytics",
    description: "Get brand lift study results",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Forms & Lead Gen ───────────────────────────────────────────────

export const LEADGEN_ENDPOINTS = {
  listForms: {
    method: "GET",
    path: "/leadForms",
    description: "List lead gen forms",
  },
  getForm: {
    method: "GET",
    path: "/leadForms/{id}",
    description: "Get a single lead gen form",
  },
  createForm: {
    method: "POST",
    path: "/leadForms",
    description: "Create a lead gen form",
  },
  listLeads: {
    method: "GET",
    path: "/leadFormResponses",
    description: "Pull lead gen form responses",
  },
} as const satisfies Record<string, EndpointDef>;

// ─── Combined registry ─────────────────────────────────────────────

export const ALL_ENDPOINTS = {
  ...ACCOUNT_ENDPOINTS,
  ...CAMPAIGN_GROUP_ENDPOINTS,
  ...CAMPAIGN_ENDPOINTS,
  ...CREATIVE_ENDPOINTS,
  ...MEDIA_ENDPOINTS,
  ...AUDIENCE_ENDPOINTS,
  ...CONVERSION_ENDPOINTS,
  ...ANALYTICS_ENDPOINTS,
  ...LEADGEN_ENDPOINTS,
} as const;

export type EndpointName = keyof typeof ALL_ENDPOINTS;
