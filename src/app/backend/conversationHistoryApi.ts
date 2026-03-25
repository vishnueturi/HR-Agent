import { getConversationHistoryBaseUrl, getHrmsAccessToken } from './config';
import type { Chat, Message } from '../store/chatSlice';

export interface ConversationHistoryRow {
  conversationId: string;
  sessionId: string | null;
  role: string | null;
  text: string | null;
  type: string | null;
  id: string;
  creationDate: string;
}

export interface ConversationHistoryPage {
  data: ConversationHistoryRow[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
}

/** Normalize one API item so grouping always keys on a single `conversationId` field. */
function normalizeConversationHistoryRow(raw: unknown): ConversationHistoryRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const conversationIdRaw = o.conversationId ?? o.ConversationId;
  const conversationId =
    typeof conversationIdRaw === 'string' ? conversationIdRaw.trim() : '';
  if (!conversationId) return null;

  const sid = o.sessionId ?? o.SessionId;
  const sessionId =
    sid === null || sid === undefined
      ? null
      : typeof sid === 'string'
        ? sid
        : null;

  const r = o.role ?? o.Role;
  const role =
    r === null || r === undefined ? null : typeof r === 'string' ? r : null;

  const textRaw = o.text ?? o.Text;
  const text = typeof textRaw === 'string' ? textRaw : null;

  const typeRaw = o.type ?? o.Type;
  const type = typeof typeRaw === 'string' ? typeRaw : null;

  const idRaw = o.id ?? o.Id;
  const id = typeof idRaw === 'string' ? idRaw.trim() : '';
  if (!id) return null;

  const cdRaw = o.creationDate ?? o.CreationDate;
  const creationDate = typeof cdRaw === 'string' ? cdRaw : '';
  if (!creationDate) return null;

  return {
    conversationId,
    sessionId,
    role,
    text,
    type,
    id,
    creationDate,
  };
}

/** Maps raw `/Conversation` `data` array into rows with a stable `conversationId` for binding. */
export function normalizeConversationHistoryRows(rawList: unknown): ConversationHistoryRow[] {
  if (!Array.isArray(rawList)) return [];
  const out: ConversationHistoryRow[] = [];
  for (const raw of rawList) {
    const row = normalizeConversationHistoryRow(raw);
    if (row) out.push(row);
  }
  return out;
}

/** All rows sharing the same `conversationId` are collected into one list (one chat thread). */
export function groupRowsByConversationId(
  rows: ConversationHistoryRow[]
): Map<string, ConversationHistoryRow[]> {
  const byConv = new Map<string, ConversationHistoryRow[]>();
  for (const row of rows) {
    const cid = row.conversationId?.trim();
    if (!cid) continue;
    const list = byConv.get(cid) ?? [];
    list.push(row);
    byConv.set(cid, list);
  }
  return byConv;
}

function authHeaders(): Record<string, string> {
  const token = getHrmsAccessToken();
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token?.trim()) {
    const t = token.trim();
    h.Authorization = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
  }
  return h;
}

/** Paginated feed of messages (see api sample: totalCount is total messages). */
export async function fetchConversationHistoryPage(
  pageNumber = 1,
  pageSize = 10
): Promise<ConversationHistoryPage> {
  const base = getConversationHistoryBaseUrl();
  const url = `${base}/Conversation?pageNumber=${pageNumber}&pageSize=${pageSize}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Conversation history failed (${res.status})`);
  }
  const json = (await res.json()) as Omit<ConversationHistoryPage, 'data'> & { data?: unknown[] };
  return {
    ...json,
    data: normalizeConversationHistoryRows(json.data),
  };
}

/**
 * Loads messages for one conversation. Tries filtered query, then path-style URL,
 * then falls back to filtering a larger page (if the server returns a global feed).
 */
export async function fetchConversationThread(
  conversationId: string
): Promise<ConversationHistoryRow[]> {
  const base = getConversationHistoryBaseUrl();
  const headers = authHeaders();
  const tries = [
    `${base}/Conversation?conversationId=${encodeURIComponent(conversationId)}&pageNumber=1&pageSize=500`,
    `${base}/Conversation/${encodeURIComponent(conversationId)}?pageNumber=1&pageSize=500`,
  ];

  const cid = conversationId.trim();

  for (const url of tries) {
    const res = await fetch(url, { headers });
    if (!res.ok) continue;
    const json = (await res.json()) as { data?: unknown[] };
    const rows = normalizeConversationHistoryRows(json.data).filter((r) => r.conversationId === cid);
    if (rows.length) {
      return sortRowsByDate(rows);
    }
  }

  const wide = await fetchConversationHistoryPage(1, 500);
  const rows = (wide.data ?? []).filter((r) => r.conversationId === cid);
  return sortRowsByDate(rows);
}

function sortRowsByDate(rows: ConversationHistoryRow[]): ConversationHistoryRow[] {
  return [...rows].sort(
    (a, b) => new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime()
  );
}

function generateChatTitleFromText(text: string): string {
  const words = text.trim().split(/\s+/);
  const title = words.slice(0, 8).join(' ');
  return title.length < text.trim().length ? `${title}…` : title;
}

function rowToMessage(row: ConversationHistoryRow): Message {
  const isAssistant = row.role === 'bot';
  return {
    id: row.id,
    type: isAssistant ? 'assistant' : 'user',
    content: row.text ?? '',
    timestamp: new Date(row.creationDate),
  };
}

function titleForGroup(sortedRows: ConversationHistoryRow[]): string {
  const firstUser = sortedRows.find((r) => r.role !== 'bot');
  const source = firstUser?.text?.trim() || sortedRows[0]?.text?.trim() || 'Chat';
  return generateChatTitleFromText(source);
}

export function titleFromHistoryRows(rows: ConversationHistoryRow[]): string {
  if (rows.length === 0) return 'Chat';
  return titleForGroup(sortRowsByDate(rows));
}

/**
 * Binds a flat `/Conversation` page into chats: every row with the same `conversationId`
 * is merged into one chat (messages ordered by `creationDate`).
 */
export function buildChatsFromHistoryRows(rawRows: unknown[] | ConversationHistoryRow[]): Chat[] {
  const rows = Array.isArray(rawRows)
    ? normalizeConversationHistoryRows(rawRows)
    : [];
  const byConv = groupRowsByConversationId(rows);

  const chats: Chat[] = [];
  for (const [conversationId, group] of byConv) {
    const sorted = sortRowsByDate(group);
    const messages = sorted.map(rowToMessage);
    const lastWithSession = [...sorted].reverse().find((r) => r.sessionId?.trim());
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    chats.push({
      id: conversationId,
      title: titleForGroup(sorted),
      messages,
      createdAt: new Date(first.creationDate),
      updatedAt: new Date(last.creationDate),
      backendConversationId: conversationId,
      backendSessionId: lastWithSession?.sessionId ?? undefined,
    });
  }

  chats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return chats;
}

export function rowsToMessages(rows: ConversationHistoryRow[]): Message[] {
  return sortRowsByDate(rows).map(rowToMessage);
}
