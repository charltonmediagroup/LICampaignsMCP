/**
 * LinkedIn Ads API client — handles auth, rate limiting, and request execution.
 * LinkedIn Marketing API v202404 (versionless REST URLs with versioned headers).
 */

const LI_API_BASE = "https://api.linkedin.com/rest";
const LI_API_VERSION = "202502";
const RATE_LIMIT_DELAY_MS = 200; // 5 req/sec baseline
const MAX_RETRIES = 3;

export interface LinkedInConfig {
  accessToken: string;
  adAccountId: string; // default account, format: "urn:li:sponsoredAccount:123456"
}

/**
 * Resolve which ad account to use — allows per-call override.
 */
export function resolveAccountId(
  defaultId: string,
  overrideId?: string
): string {
  return overrideId || defaultId;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface PaginatedResponse<T> {
  elements: T[];
  paging: { start: number; count: number; total: number };
}

let lastRequestTime = 0;

async function rateLimitedWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export function createLinkedInClient(config: LinkedInConfig) {
  const defaultHeaders: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
    "LinkedIn-Version": LI_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };

  async function request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    await rateLimitedWait();

    const url = new URL(`${LI_API_BASE}${path}`);
    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        url.searchParams.set(k, v);
      }
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url.toString(), {
          method,
          headers: defaultHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });

        // Rate limited — back off and retry
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }

        const text = await res.text();
        const data = (!text || res.status === 204 || res.status === 201)
          ? ({ _location: res.headers.get("x-restli-id") || res.headers.get("location") || null } as T)
          : (JSON.parse(text) as T);
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k] = v));

        if (!res.ok) {
          throw new Error(
            `LinkedIn API ${res.status}: ${JSON.stringify(data)}`
          );
        }

        return { status: res.status, data, headers };
      } catch (err) {
        lastError = err as Error;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  // ─── Convenience methods ───────────────────────────────────────────

  const get = <T = unknown>(path: string, params?: Record<string, string>) =>
    request<T>("GET", path, undefined, params);

  const post = <T = unknown>(path: string, body: unknown) =>
    request<T>("POST", path, body);

  const put = <T = unknown>(path: string, body: unknown) =>
    request<T>("PUT", path, body);

  const patch = <T = unknown>(path: string, body: unknown) =>
    request<T>("PATCH", path, body);

  const del = <T = unknown>(path: string) => request<T>("DELETE", path);

  /**
   * Auto-paginate through all results for a given endpoint.
   */
  async function paginate<T>(
    path: string,
    params?: Record<string, string>,
    pageSize = 100
  ): Promise<T[]> {
    const all: T[] = [];
    let start = 0;
    let total = Infinity;

    while (start < total) {
      const res = await get<PaginatedResponse<T>>(path, {
        ...params,
        start: String(start),
        count: String(pageSize),
      });
      all.push(...res.data.elements);
      total = res.data.paging?.total ?? res.data.elements.length;
      start += pageSize;
      if (res.data.elements.length === 0) break;
    }
    return all;
  }

  /**
   * Build an account-scoped path: /adAccounts/{id}/...
   * LinkedIn API v202502+ requires campaign/group endpoints under the account path.
   */
  function accountPath(subPath: string, accountIdOverride?: string): string {
    const id = resolveAccountId(config.adAccountId, accountIdOverride);
    // Extract numeric ID from URN if needed
    const numericId = id.includes(":") ? id.split(":").pop()! : id;
    return `/adAccounts/${numericId}${subPath}`;
  }

  return {
    request,
    get,
    post,
    put,
    patch,
    del,
    paginate,
    accountPath,
    config,
  };
}

export type LinkedInClient = ReturnType<typeof createLinkedInClient>;
