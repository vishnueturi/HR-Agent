import { getApiBaseUrl, getHrmsAccessToken } from './config';
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

async function postJson<TResponse>(path: string, body: unknown, token?: string | null): Promise<TResponse> {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Request failed (${res.status})`);
    }

    return (await res.json()) as TResponse;
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
  return postJson<ChatMessage>(BASICCHAT_ROUTES.ConversationStart, req, token);
}

export async function continueConversation(req: ChatMessageRequest): Promise<ChatMessage> {
  const token = getHrmsAccessToken();
  return postJson<ChatMessage>(BASICCHAT_ROUTES.ConversationContinue, req, token);
}
