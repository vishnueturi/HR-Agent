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

export function getHrmsAccessToken(): string | null {
  // First, prefer a static token from env for local/dev usage.
  const staticToken = import.meta.env.VITE_STATIC_HRMS_TOKEN;
  if (staticToken && staticToken.trim().length > 0) {
    return staticToken.trim();
  }

  const raw = localStorage.getItem(getHrmsTokenKey());
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Some apps store token as JSON (string or object).
  if (trimmed.startsWith('{') || trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const candidate = obj.accessToken ?? obj.token ?? obj.jwt;
        if (typeof candidate === 'string') return candidate;
      }
    } catch {
      // Fall through to raw string
    }
  }

  return trimmed;
}

