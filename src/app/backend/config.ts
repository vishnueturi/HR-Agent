/**
 * App config — env-based. Backend: HRAgent (D:\2.0\Agent Hub\HRAgent).
 * Chat API styles align with Recco.App (Basicchat vs AssistingAgent).
 */
function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

const TAB_HANDOFF_KEY_PREFIX = 'hr_agent_tab_handoff:';

export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  return trimTrailingSlash(env && env.trim().length > 0 ? env.trim() : 'http://localhost:5257');
}

/** GET /Conversation (paginated chat history). Defaults to Azure HR Agent host. */
export function getConversationHistoryBaseUrl(): string {
  const env = import.meta.env.VITE_CONVERSATION_HISTORY_BASE_URL;
  return trimTrailingSlash(
    env && env.trim().length > 0 ? env.trim() : 'https://hragents.azurewebsites.net'
  );
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
  const canonicalKey = getHrmsTokenKey();

  getKnownHrmsTokenKeys().forEach((key) => {
    if (key === canonicalKey) {
      localStorage.setItem(key, trimmed);
      return;
    }

    localStorage.removeItem(key);
  });
}

interface HrmsTabHandoffPayload {
  token: string;
  createdAt: number;
}

function readHrmsAccessTokenFromTabHandoff(handoffId: string | null): string | null {
  if (!handoffId || !handoffId.trim()) return null;

  const storageKey = `${TAB_HANDOFF_KEY_PREFIX}${handoffId.trim()}`;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;

  localStorage.removeItem(storageKey);

  try {
    const parsed = JSON.parse(raw) as HrmsTabHandoffPayload;
    const token = typeof parsed?.token === 'string' ? parsed.token.trim() : '';
    return token || null;
  } catch {
    return null;
  }
}

function cleanBootstrapParamsFromUrl(searchParams: URLSearchParams, hashParams: URLSearchParams): void {
  const search = new URLSearchParams(searchParams);
  const hash = new URLSearchParams(hashParams);

  ['access_token', 'token', 'handoff'].forEach((key) => {
    search.delete(key);
    hash.delete(key);
  });

  const searchString = search.toString();
  const hashString = hash.toString();
  const cleanedUrl = `${window.location.origin}${window.location.pathname}${searchString ? `?${searchString}` : ''}${hashString ? `#${hashString}` : ''}`;
  window.history.replaceState(null, document.title, cleanedUrl);
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
    ?? hashParams.get('token')
    ?? readHrmsAccessTokenFromTabHandoff(searchParams.get('handoff') ?? hashParams.get('handoff'));

  if (!token || !token.trim()) return null;

  persistHrmsAccessToken(token);

  // Clean bootstrap params after we persist the token so it is not left in the address bar.
  cleanBootstrapParamsFromUrl(searchParams, hashParams);

  return token.trim();
}

