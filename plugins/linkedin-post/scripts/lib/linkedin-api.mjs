export const DEFAULT_API_VERSION = "202608";

// Override without editing code: LINKEDIN_API_VERSION=YYYYMM node scripts/publish.mjs ...
export function resolveApiVersion(env = process.env) {
  const fromEnv = /^\d{6}$/.test(env.LINKEDIN_API_VERSION ?? "");
  return { version: fromEnv ? env.LINKEDIN_API_VERSION : DEFAULT_API_VERSION, source: fromEnv ? "env" : "default" };
}

export const API_VERSION = resolveApiVersion().version;
export const POSTS_URL = "https://api.linkedin.com/rest/posts";
export const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

const ERROR_TABLE = {
  UNAUTHORIZED: "Access token is invalid or expired. Run `node scripts/auth.mjs` to sign in again.",
  FORBIDDEN: "Missing permission. Make sure the 'Share on LinkedIn' product is added to your developer app, then re-run auth.",
  BAD_REQUEST: "LinkedIn rejected the post body. Check for unescaped reserved characters; the raw response is included.",
  RATE_LIMITED: "Daily posting limit reached. Try again tomorrow; the script will not retry.",
  SERVER_ERROR: "LinkedIn returned a server error. Not retried to avoid duplicate posts. Check your feed before retrying.",
  NETWORK: "Could not reach api.linkedin.com. If this happened while publishing, check your feed before retrying — the post may already exist.",
  API_VERSION_INACTIVE: "LinkedIn no longer serves this API version. Set LINKEDIN_API_VERSION=YYYYMM to a currently active version (LinkedIn keeps roughly the last 12 months), or update DEFAULT_API_VERSION in scripts/lib/linkedin-api.mjs.",
  UNKNOWN: "Unexpected response from LinkedIn. The raw response is included.",
};

export class LinkedInApiError extends Error {
  constructor(code, status, body, message = `LinkedIn API ${code}${status ? ` (${status})` : ""}`) {
    super(message);
    this.name = "LinkedInApiError";
    this.code = code;
    this.status = status;
    this.body = body;
    this.hint = ERROR_TABLE[code];
  }
}

export function mapStatusToError(status, body) {
  const code =
    status === 401 ? "UNAUTHORIZED"
    : status === 403 ? "FORBIDDEN"
    : status === 400 || status === 422 ? "BAD_REQUEST"
    : status === 426 ? "API_VERSION_INACTIVE"
    : status === 429 ? "RATE_LIMITED"
    : status >= 500 ? "SERVER_ERROR"
    : "UNKNOWN";
  return new LinkedInApiError(code, status, body);
}

// Read-only check of whether LinkedIn still serves a version. A personal app
// may not read posts, so an active version answers 403 (permission) while a
// retired one answers 426 NONEXISTENT_VERSION before permissions are checked.
export async function probeApiVersion({ accessToken, authorUrn, version, fetchImpl = fetch }) {
  const url = `${POSTS_URL}?q=author&author=${encodeURIComponent(authorUrn)}&count=1`;
  const headers = { Authorization: `Bearer ${accessToken}`, "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" };
  let res;
  try {
    res = await fetchImpl(url, { method: "GET", headers });
  } catch (error) {
    throw new LinkedInApiError("NETWORK", 0, String(error?.message ?? error));
  }
  if (res.status === 426) return "inactive";
  if (res.ok || res.status === 403) return "active";
  throw mapStatusToError(res.status, await res.text());
}

export function postUrl(id) {
  return `https://www.linkedin.com/feed/update/${id}`;
}

// Codes that only ever occur before a request left the machine (DNS lookup or
// TCP connect failures). Any other fetch rejection - including a bare
// "fetch failed" TypeError with no cause - may mean the request reached the
// server, so it must not be retried for a non-idempotent POST.
const PRE_SEND_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"]);

export const isPreSendError = (error) => PRE_SEND_CODES.has(error?.cause?.code ?? error?.code);

const alwaysRetry = () => true;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ accessToken, fetchImpl = fetch, sleep = defaultSleep, retryDelayMs = 3000 }) {
  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  async function request(url, init, { retryOn }) {
    try {
      return await fetchImpl(url, init);
    } catch (first) {
      if (!retryOn(first)) {
        throw new LinkedInApiError("NETWORK", 0, String(first?.message ?? first));
      }
      await sleep(retryDelayMs);
      try {
        return await fetchImpl(url, init);
      } catch (second) {
        const error = new LinkedInApiError("NETWORK", 0, String(second?.message ?? second));
        error.cause = first;
        throw error;
      }
    }
  }

  async function getUserInfo() {
    const res = await request(USERINFO_URL, { method: "GET", headers: baseHeaders }, { retryOn: alwaysRetry });
    if (!res.ok) throw mapStatusToError(res.status, await res.text());
    const data = await res.json();
    return { sub: data.sub, name: data.name };
  }

  async function createPost({ authorUrn, commentary, visibility }) {
    const body = {
      author: authorUrn,
      commentary,
      visibility,
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    const res = await request(
      POSTS_URL,
      {
        method: "POST",
        headers: { ...baseHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { retryOn: isPreSendError },
    );
    if (!res.ok) throw mapStatusToError(res.status, await res.text());
    const id = res.headers.get("x-restli-id");
    if (!id) throw new LinkedInApiError("UNKNOWN", res.status, "", "Post created but x-restli-id header missing");
    return { id, url: postUrl(id) };
  }

  return { getUserInfo, createPost };
}
