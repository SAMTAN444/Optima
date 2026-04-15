/**
 * OneMap API client — centralised auth + fetch with timeout.
 *
 * Auth priority:
 *   1. ONEMAP_TOKEN  (static env token — preferred)
 *   2. ONEMAP_EMAIL + ONEMAP_PASSWORD  (legacy — fetches token on demand)
 *
 * The active token is NEVER logged or exposed to callers.
 */

const ONEMAP_BASE = 'https://www.onemap.gov.sg';
const TIMEOUT_MS = 9_000;

// ── Legacy credential cache ──────────────────────────────────────────────────
let _legacyToken: string | null = null;
let _legacyExpiry = 0;

async function fetchLegacyToken(): Promise<string | null> {
  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) return null;

  // Return cached token if still valid
  if (_legacyToken && Date.now() < _legacyExpiry - 60_000) return _legacyToken;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const resp = await fetch(`${ONEMAP_BASE}/api/auth/post/getToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (!resp.ok) return null;
    const data = (await resp.json()) as { access_token?: string; expiry_timestamp?: string };
    if (!data.access_token) return null;

    _legacyToken = data.access_token;
    _legacyExpiry = data.expiry_timestamp
      ? parseInt(data.expiry_timestamp) * 1000
      : Date.now() + 3 * 24 * 60 * 60 * 1000;

    console.log('[OneMap] Token obtained via email/password (legacy)');
    return _legacyToken;
  } catch {
    return null;
  }
}

/**
 * Reads the `exp` claim from a JWT without verifying the signature.
 * Returns the expiry as a Unix timestamp (seconds), or null if unparseable.
 */
function parseJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

/**
 * Returns the active bearer token, or null if neither source is configured/valid.
 * Priority: ONEMAP_TOKEN (if not expired) > email/password legacy auth.
 */
export async function getToken(): Promise<string | null> {
  if (process.env.ONEMAP_TOKEN) {
    const exp = parseJwtExp(process.env.ONEMAP_TOKEN);
    if (exp !== null && Date.now() > exp * 1000) {
      console.warn(
        '[OneMap] ONEMAP_TOKEN has expired — falling back to email/password auth.\n' +
        '  Update ONEMAP_TOKEN in apps/api/.env and restart the server.'
      );
      // Fall through to legacy auth below
    } else {
      return process.env.ONEMAP_TOKEN;
    }
  }
  return fetchLegacyToken();
}

/**
 * True if any token source is available in the environment.
 */
export function isConfigured(): boolean {
  return !!(
    process.env.ONEMAP_TOKEN ||
    (process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD)
  );
}

/**
 * Returns true when ONEMAP_TOKEN is set but its JWT exp claim is in the past.
 * Used for startup diagnostics only.
 */
export function isStaticTokenExpired(): boolean {
  const token = process.env.ONEMAP_TOKEN;
  if (!token) return false;
  const exp = parseJwtExp(token);
  return exp !== null && Date.now() > exp * 1000;
}

/**
 * Fetch an authenticated OneMap endpoint (includes Authorization header + timeout).
 * Throws OneMapNotConfiguredError if no token source is configured.
 */
export async function onemapFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  if (!token) throw new OneMapNotConfiguredError();

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(`${ONEMAP_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Fetch a public (unauthenticated) OneMap endpoint with timeout.
 * Used for elastic/search geocoding which does not require auth.
 */
export async function onemapPublicFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(`${ONEMAP_BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

export class OneMapNotConfiguredError extends Error {
  readonly code = 'ONEMAP_NOT_CONFIGURED';
  constructor() {
    super('OneMap token not configured');
    this.name = 'OneMapNotConfiguredError';
  }
}
