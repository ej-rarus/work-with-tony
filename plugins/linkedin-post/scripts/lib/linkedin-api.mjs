export const API_VERSION = "202508";
export const POSTS_URL = "https://api.linkedin.com/rest/posts";
export const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

const ERROR_TABLE = {
  UNAUTHORIZED: "Access token is invalid or expired. Run `node scripts/auth.mjs` to sign in again.",
  FORBIDDEN: "Missing permission. Make sure the 'Share on LinkedIn' product is added to your developer app, then re-run auth.",
  BAD_REQUEST: "LinkedIn rejected the post body. Check for unescaped reserved characters; the raw response is included.",
  RATE_LIMITED: "Daily posting limit reached. Try again tomorrow; the script will not retry.",
  SERVER_ERROR: "LinkedIn returned a server error. Not retried to avoid duplicate posts. Check your feed before retrying.",
  NETWORK: "Could not reach api.linkedin.com after one retry. Check your connection.",
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
    : status === 429 ? "RATE_LIMITED"
    : status >= 500 ? "SERVER_ERROR"
    : "UNKNOWN";
  return new LinkedInApiError(code, status, body);
}

export function postUrl(id) {
  return `https://www.linkedin.com/feed/update/${id}`;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ accessToken, fetchImpl = fetch, sleep = defaultSleep, retryDelayMs = 3000 }) {
  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  async function request(url, init) {
    try {
      return await fetchImpl(url, init);
    } catch (first) {
      await sleep(retryDelayMs);
      try {
        return await fetchImpl(url, init);
      } catch (second) {
        throw new LinkedInApiError("NETWORK", 0, String(second?.message ?? second));
      }
    }
  }

  async function getUserInfo() {
    const res = await request(USERINFO_URL, { method: "GET", headers: baseHeaders });
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
    const res = await request(POSTS_URL, {
      method: "POST",
      headers: { ...baseHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw mapStatusToError(res.status, await res.text());
    const id = res.headers.get("x-restli-id");
    if (!id) throw new LinkedInApiError("UNKNOWN", res.status, "", "Post created but x-restli-id header missing");
    return { id, url: postUrl(id) };
  }

  return { getUserInfo, createPost };
}
