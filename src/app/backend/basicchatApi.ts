import { getApiBaseUrl, getApiJsonPascalCase, getHrmsAccessToken } from './config';
import type { ChatMessage, ChatMessageRequest, KickoffRequestViewModel } from './types';

// ---------------------------------------------------------------------------
// REST API — matches HRAgent BasicchatController ([Route("[controller]")] → Basicchat)
// POST Basicchat/Conversation/Start  → StartConversation(KickoffRequestViewModel)
// POST Basicchat/Conversation/Continue → ContinueConversation(ChatMessageRequest)
// ---------------------------------------------------------------------------

export const BASICCHAT_ROUTES = {
  ConversationStart: '/Basicchat/Conversation/Start',
  ConversationContinue: '/Basicchat/Conversation/Continue',
} as const;

/** 3-minute timeout — AI orchestration can take well over 1 minute for complex queries. */
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

function toPascalCaseObject(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(toPascalCaseObject);
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
      const pascalKey = key.length > 0 ? key[0].toUpperCase() + key.slice(1) : key;
      out[pascalKey] = toPascalCaseObject(value);
    });
    return out;
  }
  return input;
}

function normalizeChatMessage(raw: unknown): ChatMessage {
  const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  return {
    id: (obj.id ?? obj.Id) as string | undefined,
    conversationId: (obj.conversationId ?? obj.ConversationId) as string | undefined,
    sessionId: (obj.sessionId ?? obj.SessionId) as string | undefined,
    role: (obj.role ?? obj.Role) as string | undefined,
    text: (obj.text ?? obj.Text) as string | undefined,
    url: (obj.url ?? obj.Url) as string | undefined,
    label: (obj.label ?? obj.Label) as string | undefined,
    alt: (obj.alt ?? obj.Alt) as string | undefined,
    stage: (obj.stage ?? obj.Stage) as string | undefined,
    creationDate: (obj.creationDate ?? obj.CreationDate) as string | undefined,
    nextPossibleIntents: (obj.nextPossibleIntents ?? obj.NextPossibleIntents) as Record<string, string> | undefined,
  };
}

function getResponseErrorText(payload: unknown, status: number): string {
  if (typeof payload === 'string' && payload.trim()) return `${status}: ${payload.trim()}`;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const detail = obj.detail ?? obj.Detail ?? obj.title ?? obj.Title ?? obj.message ?? obj.Message;
    if (typeof detail === 'string' && detail.trim()) return `${status}: ${detail.trim()}`;
  }
  return `Request failed (${status})`;
}

async function postJson<TResponse>(
  path: string,
  body: unknown,
  token?: string | null,
  normalize?: (raw: unknown) => TResponse
): Promise<TResponse> {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const requestBody = getApiJsonPascalCase() ? toPascalCaseObject(body) : body;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let parsed: unknown = text;
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }
      throw new Error(getResponseErrorText(parsed, res.status));
    }

    const raw = (await res.json()) as unknown;
    return normalize ? normalize(raw) : (raw as TResponse);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out after 3 minutes. The server may still be processing — check for a response via the stream.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function startConversation(req: KickoffRequestViewModel): Promise<ChatMessage> {
  const token = getHrmsAccessToken();
  return postJson<ChatMessage>(BASICCHAT_ROUTES.ConversationStart, req, token, normalizeChatMessage);
}

export async function continueConversation(req: ChatMessageRequest): Promise<ChatMessage> {
  const token = getHrmsAccessToken();
  return postJson<ChatMessage>(BASICCHAT_ROUTES.ConversationContinue, req, token, normalizeChatMessage);
}
