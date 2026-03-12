import * as signalR from '@microsoft/signalr';
import { getApiBaseUrl, getHrmsAccessToken } from './config';
import type { ChatMessage, ChatStreamChunk } from './types';

// ---------------------------------------------------------------------------
// SignalR hub contract — matches HRAgent backend (ChatHub.cs, MapHub at /chathub)
// ---------------------------------------------------------------------------
// Server methods (client invokes):
//   - JoinConversation(sessionId: string) — join conversation group for streaming
//   - Heartbeat() — server responds with HeartbeatResponse
// Server → client events:
//   - HeartbeatResponse(timestamp) — after Heartbeat()
//   - Optional: StreamChat / other events from orchestrator via PushNotificationService
// ---------------------------------------------------------------------------

export const HUB_PATH = '/chathub';
export const HUB_METHODS = {
  JoinConversation: 'JoinConversation',
  Heartbeat: 'Heartbeat',
} as const;
export const HUB_EVENTS = {
  HeartbeatResponse: 'HeartbeatResponse',
} as const;

type ReceiveMessageHandler = (msg: ChatMessage) => void;
type StreamChunkHandler = (chunk: ChatStreamChunk) => void;
type HeartbeatHandler = (timestamp: string) => void;

export interface ChatHubHandlers {
  onReceiveMessage?: ReceiveMessageHandler;
  onStreamChunk?: StreamChunkHandler;
  onHeartbeat?: HeartbeatHandler;
  onUnknownEvent?: (eventName: string, payload: unknown[]) => void;
  onError?: (err: unknown) => void;
}

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export const STREAM_EVENT_NAMES = [
  'StreamChat',
  'ChatMsgStream',
  'EventChatMsgStream',
  'EVENT_CHAT_MSG_STREAM',
];

const CARD_TYPES = new Set([
  'Card',
  'card',
  'GetI9ComplianceSummary',
  'GetI9SectionPendingList',
  'GetI9ExpirationList',
]);

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function getArg(args: unknown[], index: number): string {
  if (index < 0 || index >= args.length) return '';
  return asString(args[index]);
}

export function extractChunkFromArgs(args: unknown[]): ChatStreamChunk | null {
  if (!args.length) return null;

  // Full backend payload shape:
  // [conversationId, id, id, text, true, serializedContent, type, role]
  if (args.length >= 8) {
    const messageType = getArg(args, 6);
    if (CARD_TYPES.has(messageType)) return null;

    const text = getArg(args, 3);
    if (!text) return null;

    return {
      chunk: text,
      conversationId: getArg(args, 0) || undefined,
      role: getArg(args, 7) || undefined,
    };
  }

  if (args.length === 1) {
    return { chunk: getArg(args, 0) };
  }

  if (args.length === 2) {
    return {
      conversationId: getArg(args, 0) || undefined,
      chunk: getArg(args, 1),
    };
  }

  // 3 args: e.g. [conversationId, id, text]
  if (args.length === 3) {
    const text = getArg(args, 2) || getArg(args, 1) || getArg(args, 0);
    if (!text) return null;
    return { chunk: text, conversationId: getArg(args, 0) || undefined };
  }

  // 4 or 5 args: e.g. [conversationId, messageId, chunkId, text] or [..., isFinalChunk]
  if (args.length === 4 || args.length === 5) {
    const text = getArg(args, 3) || getArg(args, 2) || getArg(args, 0);
    if (!text) return null;
    return { chunk: text, conversationId: getArg(args, 0) || undefined };
  }

  // Common fallback where text sits at index 3.
  const text = getArg(args, 3) || getArg(args, 0);
  if (!text) return null;

  return {
    chunk: text,
    conversationId: getArg(args, 0) || undefined,
  };
}

export function extractChunkFromPayload(payload: unknown): ChatStreamChunk | null {
  if (!payload) return null;
  if (typeof payload === 'string') return { chunk: payload };
  if (Array.isArray(payload)) return extractChunkFromArgs(payload);
  if (typeof payload !== 'object') return { chunk: asString(payload) };

  const anyPayload = payload as Record<string, unknown>;
  const chunk =
    asString(anyPayload.chunk) ||
    asString(anyPayload.Chunk) ||
    asString(anyPayload.text) ||
    asString(anyPayload.Text);

  if (!chunk) return null;

  return {
    chunk,
    conversationId: asString(anyPayload.conversationId || anyPayload.ConversationId) || undefined,
    sessionId: asString(anyPayload.sessionId || anyPayload.SessionId) || undefined,
    role: asString(anyPayload.role || anyPayload.Role) || undefined,
  };
}

export class ChatHubClient {
  private connection: signalR.HubConnection | null = null;
  private handlers: ChatHubHandlers;
  private currentSessionId: string | null = null;

  constructor(handlers: ChatHubHandlers) {
    this.handlers = handlers;
  }

  async connectIfNeeded() {
    if (this.connection && this.connection.state !== signalR.HubConnectionState.Disconnected) return;

    const token = getHrmsAccessToken();
    const url = joinUrl(getApiBaseUrl(), HUB_PATH);

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(url, {
        accessTokenFactory: () => token ?? '',
      })
      .withAutomaticReconnect()
      .build();

    // Backend: ChatHub.Heartbeat() → SendAsync("HeartbeatResponse", DateTime.UtcNow)
    this.connection.on(HUB_EVENTS.HeartbeatResponse, (timestamp: string) => {
      this.handlers.onHeartbeat?.(timestamp);
    });

    // Optional: events sent via PushNotificationService.SendToGroupAsync (orchestrator);
    // backend comment: "StreamChat events are delivered via SignalR" after JoinConversation
    this.connection.on('ReceiveMessage', (msg: ChatMessage) => {
      this.handlers.onReceiveMessage?.(msg);
    });
    this.connection.on('ChatMessage', (msg: ChatMessage) => {
      this.handlers.onReceiveMessage?.(msg);
    });
    this.connection.on('ChatMessageCreated', (msg: ChatMessage) => {
      this.handlers.onReceiveMessage?.(msg);
    });
    this.connection.on('StreamChunk', (payload: unknown) => {
      const chunk = extractChunkFromPayload(payload);
      if (chunk) this.handlers.onStreamChunk?.(chunk);
    });
    STREAM_EVENT_NAMES.forEach((eventName) => {
      this.connection?.on(eventName, (...args: unknown[]) => {
        const chunk = extractChunkFromArgs(args);
        if (chunk) {
          this.handlers.onStreamChunk?.(chunk);
        } else {
          this.handlers.onUnknownEvent?.(eventName, args);
        }
      });
    });

    const anyConnection = this.connection as unknown as { onAny?: (...args: unknown[]) => void };
    if (typeof anyConnection.onAny === 'function') {
      anyConnection.onAny((eventName: string, ...args: unknown[]) => {
        this.handlers.onUnknownEvent?.(eventName, args);
      });
    }

    this.connection.onclose((err) => {
      if (err) this.handlers.onError?.(err);
    });

    await this.connection.start();
  }

  /** Joins the conversation group for streaming. Call after session is known (e.g. from Start/Continue response). */
  async joinConversation(sessionId: string) {
    if (!sessionId) return;
    await this.connectIfNeeded();
    if (!this.connection) return;
    if (this.currentSessionId === sessionId) return;
    this.currentSessionId = sessionId;
    await this.connection.invoke(HUB_METHODS.JoinConversation, sessionId);
  }

  async heartbeat() {
    await this.connectIfNeeded();
    await this.connection?.invoke(HUB_METHODS.Heartbeat);
  }

  async stop() {
    this.currentSessionId = null;
    if (this.connection) {
      try {
        await this.connection.stop();
      } finally {
        this.connection = null;
      }
    }
  }
}
