/**
 * SignalR service for streaming chat — aligned with HRAgent backend (Agent Hub).
 *
 * Backend (ChatHub.cs + PushNotificationService.cs):
 * - Hub at /chathub; OnConnectedAsync adds connection to group(ownerId); JoinConversation(sessionId) adds to group(sessionId).
 * - Streaming: SendToGroupAsync(ownerId, "StreamChat", chunk) — one chunk per call (case 1: args[0] only).
 * - Client must JoinConversation(ownerId) to receive StreamChat. Messages do not come in one go; many StreamChat(chunk) calls.
 */

import * as signalR from '@microsoft/signalr';
import { getApiBaseUrl, getHrmsAccessToken } from './config';

const HUB_PATH = '/chathub';

function getHubUrl(): string {
  const base = getApiBaseUrl().replace(/\/+$/, '');
  return base ? `${base}${HUB_PATH}` : HUB_PATH;
}

// Backend sends event "StreamChat" with single arg (chunk string)
const STREAM_EVENT_NAME = (() => {
  const env = typeof import.meta !== 'undefined' && (import.meta.env as Record<string, unknown>)?.VITE_SIGNALR_STREAM_EVENT;
  return (typeof env === 'string' && env.trim()) ? env.trim() : 'StreamChat';
})();

export type StreamChatHandler = (chunk: string) => void;

export interface CardMessagePayload {
  content: string;
  type: string;
  serializedContent: string;
  messageId?: string;
  conversationId?: string;
  profileUrlConfig?: string;
}

export type CardMessageHandler = (payload: CardMessagePayload) => void;

let connection: signalR.HubConnection | null = null;
let intentionallyStopped = false;

/** Periodic heartbeat to keep the SignalR connection alive during long AI responses (>30 s). */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Last session joined via JoinConversation — tracked so we can automatically re-join
 * after a SignalR reconnect and continue receiving StreamChat chunks.
 */
let lastJoinedSessionId: string | null = null;

// Card types from backend — do not treat as stream text chunk
const CARD_TYPES = new Set([
  'Card', 'card', 'GetI9ComplianceSummary', 'GetI9SectionPendingList', 'GetI9ExpirationList',
]);

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Extract the displayable text chunk from StreamChat args.
 * Backend (PushNotificationService) can send 1 arg (chunk) or multi-arg payloads from
 * orchestrator, e.g. [conversationId, id, id, text, isFinal, serializedContent, type, role].
 * Using only args[0] would show conversationId/messageId (hex) instead of text.
 */
function getChunkFromStreamChatArgs(args: unknown[]): string {
  if (!args || args.length === 0) return '';

  // Single arg: chunk only (current backend logs show "StreamChat. Hello" etc.)
  if (args.length === 1) {
    return asString(args[0]);
  }

  // Full payload shape: [conversationId, id, id, text, true, serializedContent, type, role]
  if (args.length >= 8) {
    const messageType = asString(args[6]);
    if (CARD_TYPES.has(messageType)) return '';
    return asString(args[3]);
  }

  // 2 args: [conversationId, chunk]
  if (args.length === 2) {
    return asString(args[1]);
  }

  // 3 args: e.g. [conversationId, id, text]
  if (args.length === 3) {
    return asString(args[2]) || asString(args[1]) || asString(args[0]);
  }

  // 4 or 5 args: text often at index 3 or 2
  if (args.length === 4 || args.length === 5) {
    return asString(args[3]) || asString(args[2]) || asString(args[0]);
  }

  // Fallback: text often at index 3 in multi-arg payloads
  return asString(args[3]) || asString(args[0]);
}

function setupStreamChatHandler(
  conn: signalR.HubConnection,
  onStreamChat: StreamChatHandler,
  _onCardMessage?: CardMessageHandler
): void {
  conn.off(STREAM_EVENT_NAME);
  conn.off('StreamChat');
  const handleStreamChat = (...args: unknown[]) => {
    const chunk = getChunkFromStreamChatArgs(args);
    try {
      onStreamChat(chunk);
    } catch (error) {
      console.error('[SignalR] onStreamChat error:', error);
    }
  };
  conn.on(STREAM_EVENT_NAME, handleStreamChat);
  if (STREAM_EVENT_NAME !== 'StreamChat') {
    conn.on('StreamChat', handleStreamChat);
  }
}

export interface ConnectSignalROptions {
  onStreamChat: StreamChatHandler;
  onCardMessage?: CardMessageHandler;
}

/** Get Bearer token for SignalR (header/form). Uses same source as config. */
function getBearerToken(): string {
  const raw = getHrmsAccessToken();
  if (!raw || !raw.trim()) return '';
  const trimmed = raw.trim();
  return trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}`;
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await connection.invoke('Heartbeat');
      } catch {
        // Non-critical — server will drop connection naturally if it truly goes away
      }
    }
  }, 15_000); // Every 15 s — well within the server's 30 s default timeout
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export async function connectSignalR(
  onStreamChatOrOptions: StreamChatHandler | ConnectSignalROptions
): Promise<signalR.HubConnection> {
  const onStreamChat = typeof onStreamChatOrOptions === 'function'
    ? onStreamChatOrOptions
    : onStreamChatOrOptions.onStreamChat;
  const onCardMessage = typeof onStreamChatOrOptions === 'function'
    ? undefined
    : onStreamChatOrOptions.onCardMessage;

  if (connection?.state === signalR.HubConnectionState.Connected) {
    setupStreamChatHandler(connection, onStreamChat, onCardMessage);
    return connection;
  }

  const hubUrl = getHubUrl();
  const token = getBearerToken();
  const tokenOnly = token.replace(/^Bearer\s+/i, '').trim();

  connection = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl, {
      accessTokenFactory: () => tokenOnly,
      ...(token ? { headers: { Authorization: token } } : {}),
      skipNegotiation: false,
      transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
    })
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: (retryContext) =>
        Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000),
    })
    .configureLogging(signalR.LogLevel.Information)
    .build();

  // Extend timeouts so long AI responses (>1 min) don't kill the connection.
  // Default serverTimeoutInMilliseconds = 30 000 ms — not enough for complex queries.
  connection.serverTimeoutInMilliseconds = 180_000;   // 3 minutes
  connection.keepAliveIntervalInMilliseconds = 15_000; // 15 s ping interval

  setupStreamChatHandler(connection, onStreamChat, onCardMessage);

  connection.onclose((error) => {
    stopHeartbeat();
    if (intentionallyStopped) {
      intentionallyStopped = false;
      return; // Expected close from disconnectSignalR() — not an error
    }
    const msg = error?.message ?? (error != null ? String(error) : 'unknown reason');
    console.error('[SignalR] Connection closed unexpectedly:', msg);
  });

  connection.onreconnecting(() => {
    console.warn('[SignalR] Reconnecting...');
  });

  connection.onreconnected(async (connectionId) => {
    console.log('[SignalR] Reconnected:', connectionId);
    startHeartbeat();

    // Re-join userId group first
    const userId = getUserIdFromToken();
    if (userId && connection) {
      try {
        await connection.invoke('JoinConversation', userId);
      } catch (err) {
        console.error('[SignalR] Failed to rejoin userId group:', err);
      }
    }

    // Re-join the last active session group so in-flight StreamChat chunks
    // are not lost after a reconnect mid-stream.
    if (lastJoinedSessionId && connection) {
      try {
        await connection.invoke('JoinConversation', lastJoinedSessionId);
        console.log('[SignalR] Re-joined session group after reconnect:', lastJoinedSessionId);
      } catch (err) {
        console.error('[SignalR] Failed to rejoin session group after reconnect:', err);
      }
    }
  });

  try {
    await connection.start();
    startHeartbeat();

    const userId = getUserIdFromToken();
    if (userId) {
      try {
        await connection.invoke('JoinConversation', userId);
      } catch (err) {
        console.warn('[SignalR] Failed to join userId group (may already be in group):', err);
      }
    }
    return connection;
  } catch (error) {
    console.error('[SignalR] Connection failed:', error);
    throw error;
  }
}

export async function joinConversation(sessionId: string): Promise<void> {
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
    throw new Error('SignalR not connected. Call connectSignalR first.');
  }
  lastJoinedSessionId = sessionId; // Track for automatic re-join after reconnect
  await connection.invoke('JoinConversation', sessionId);
}

export async function joinUserIdGroup(): Promise<void> {
  if (!connection) throw new Error('SignalR connection not initialized');
  if (connection.state !== signalR.HubConnectionState.Connected) {
    throw new Error(`SignalR not connected. State: ${connection.state}. Call connectSignalR first.`);
  }
  const userId = getUserIdFromToken();
  if (userId) {
    await connection.invoke('JoinConversation', userId);
  } else {
    console.warn('[SignalR] No extension_userId in token; StreamChat may not be received.');
  }
}

export function disconnectSignalR(): void {
  stopHeartbeat();
  lastJoinedSessionId = null;
  if (connection) {
    intentionallyStopped = true;
    connection.stop().catch(() => {});
    connection = null;
  }
}

export function generateSessionId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Extract userId from JWT for JoinConversation; backend (UserContextService) uses extension_userId. */
export function getUserIdFromToken(): string | null {
  try {
    const raw = getHrmsAccessToken();
    if (!raw) return null;
    const token = raw.trim().startsWith('Bearer ') ? raw.trim().slice(7).trim() : raw.trim();
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1])) as Record<string, unknown>;
    return (
      (payload.extension_userId as string) ??
      (payload.extension_userid as string) ??
      (payload.sub as string) ??
      null
    );
  } catch {
    return null;
  }
}
