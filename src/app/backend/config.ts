/**
 * App config — env-based. Backend: HRAgent (D:\2.0\Agent Hub\HRAgent).
 * Chat API styles align with Recco.App (Basicchat vs AssistingAgent).
 */
function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  return trimTrailingSlash(env && env.trim().length > 0 ? env.trim() : 'http://localhost:5257');
}

export function getHrmsTokenKey(): string {
  const env = import.meta.env.VITE_HRMS_TOKEN_KEY;
  return env && env.trim().length > 0 ? env.trim() : 'accessToken';
}

function getKnownHrmsTokenKeys(): string[] {
  const configuredKey = getHrmsTokenKey();
  return Array.from(new Set([
    configuredKey,
    'access_token',
    'accessToken',
    'token',
  ].filter(Boolean)));
}

/** Chat API style: Basicchat (HRAgent) or AssistingAgent (Recco.App style). */
export type ChatApiStyle = 'Basicchat' | 'AssistingAgent';

export function getChatApiStyle(): ChatApiStyle {
  const v = import.meta.env.VITE_CHAT_API;
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'assistingagent' ? 'AssistingAgent' : 'Basicchat';
}

export function getApiJsonPascalCase(): boolean {
  const v = import.meta.env.VITE_API_JSON_PASCAL_CASE;
  return v === 'true' || v === '1';
}

export function getHrmsAccessToken(): string | null {
  // First, prefer a static token from env for local/dev usage.
  const staticToken = import.meta.env.VITE_STATIC_HRMS_TOKEN;
  if (staticToken && staticToken.trim().length > 0) {
    return staticToken.trim();
  }

  for (const key of getKnownHrmsTokenKeys()) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Some apps store token as JSON (string or object).
    if (trimmed.startsWith('{') || trimmed.startsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (typeof parsed === 'string') return parsed;
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          const candidate = obj.accessToken ?? obj.access_token ?? obj.token ?? obj.jwt;
          if (typeof candidate === 'string' && candidate.trim()) return candidate;
        }
      } catch {
        // Fall through to raw string
      }
    }

    return trimmed;
  }

  return null;
}

export function persistHrmsAccessToken(token: string): void {
  const trimmed = token.trim();
  if (!trimmed) return;

  getKnownHrmsTokenKeys().forEach((key) => {
    localStorage.setItem(key, trimmed);
  });
}

export function bootstrapHrmsAccessTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);

  const token = searchParams.get('access_token')
    ?? hashParams.get('access_token')
    ?? searchParams.get('token')
    ?? hashParams.get('token');

  if (!token || !token.trim()) return null;

  persistHrmsAccessToken(token);

  // Clean the iframe URL after we persist the token so it is not left in the address bar.
  const cleanedUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, document.title, cleanedUrl);

  return token.trim();
}

