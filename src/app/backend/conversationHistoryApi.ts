import { getConversationHistoryBaseUrl, getHrmsAccessToken } from './config';
import type { Chat, ChatHistoryPagination, Message } from '../store/chatSlice';

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

/** One page from GET /Conversation/by-conversation (newest page is typically pageNo 0). */
export interface ByConversationPageResult {
  rows: ConversationHistoryRow[];
  totalCount: number;
  /** Page index from the API response (0-based). */
  pageNumber: number;
  pageSize: number;
}

const DEFAULT_THREAD_PAGE_SIZE = 20;

/** Default page size for GET /Conversation (paginated message feed). */
const DEFAULT_CONVERSATION_LIST_PAGE_SIZE = 20;

export function getDefaultThreadPageSize(): number {
  return DEFAULT_THREAD_PAGE_SIZE;
}

export function getDefaultConversationListPageSize(): number {
  return DEFAULT_CONVERSATION_LIST_PAGE_SIZE;
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
  pageSize = DEFAULT_CONVERSATION_LIST_PAGE_SIZE
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

/** Append new rows; skip duplicates by message `id` (safe if API overlaps pages). */
export function mergeConversationHistoryRows(
  existing: ConversationHistoryRow[],
  batch: ConversationHistoryRow[]
): ConversationHistoryRow[] {
  if (batch.length === 0) return existing;
  const seen = new Set(existing.map((r) => r.id));
  const out = [...existing];
  for (const row of batch) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/**
 * After loading one GET /Conversation page, whether another page may exist.
 * `accumulatedRowCount` is total rows merged so far (including this page).
 */
export function conversationFeedHasMoreAfterPage(
  page: ConversationHistoryPage,
  accumulatedRowCount: number
): boolean {
  const batch = page.data ?? [];
  const pageSize = page.pageSize;
  const totalCount =
    typeof page.totalCount === 'number' && page.totalCount >= 0 ? page.totalCount : 0;

  if (batch.length === 0) return false;
  if (batch.length < pageSize) return false;
  if (totalCount > 0 && accumulatedRowCount >= totalCount) return false;
  return true;
}

const MAX_HISTORY_FETCH_PAGES = 50;

/** Deduplicate concurrent default-parameter loads (e.g. dev Strict Mode remount). */
let fetchAllHistoryInFlight: Promise<ConversationHistoryRow[]> | null = null;

/**
 * Fetches every page of GET /Conversation until the feed is exhausted or limits are hit.
 * Rows are message-level; use {@link buildChatsFromHistoryRows} to group into chats.
 */
export async function fetchAllConversationHistoryRows(
  pageSize = DEFAULT_CONVERSATION_LIST_PAGE_SIZE,
  maxPages = MAX_HISTORY_FETCH_PAGES
): Promise<ConversationHistoryRow[]> {
  const useDedupe =
    pageSize === DEFAULT_CONVERSATION_LIST_PAGE_SIZE && maxPages === MAX_HISTORY_FETCH_PAGES;
  if (useDedupe && fetchAllHistoryInFlight) {
    return fetchAllHistoryInFlight;
  }

  const run = (async () => {
    const all: ConversationHistoryRow[] = [];
    let pageNumber = 1;

    while (pageNumber <= maxPages) {
      const page = await fetchConversationHistoryPage(pageNumber, pageSize);
      const batch = page.data ?? [];
      const totalCount =
        typeof page.totalCount === 'number' && page.totalCount >= 0 ? page.totalCount : 0;

      all.push(...batch);

      if (batch.length === 0) break;
      if (batch.length < pageSize) break;
      if (totalCount > 0 && all.length >= totalCount) break;

      pageNumber++;
    }

    return all;
  })();

  if (useDedupe) {
    fetchAllHistoryInFlight = run;
    run.finally(() => {
      if (fetchAllHistoryInFlight === run) fetchAllHistoryInFlight = null;
    });
  }

  return run;
}

function sortRowsByDate(rows: ConversationHistoryRow[]): ConversationHistoryRow[] {
  return [...rows].sort(
    (a, b) => new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime()
  );
}

/**
 * Paginated thread from GET /Conversation/by-conversation?conversationId=…&pageNo=…&pageSize=….
 * Returns null if the request fails (caller may fall back to {@link fetchConversationThread}).
 */
export async function fetchConversationByConversationPage(
  conversationId: string,
  pageNo: number,
  pageSize: number
): Promise<ByConversationPageResult | null> {
  const base = getConversationHistoryBaseUrl();
  const cid = conversationId.trim();
  const url = `${base}/Conversation/by-conversation?conversationId=${encodeURIComponent(cid)}&pageNo=${pageNo}&pageSize=${pageSize}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: unknown[];
    totalCount?: number;
    pageNumber?: number;
    pageNo?: number;
    pageSize?: number;
  };
  const rows = normalizeConversationHistoryRows(json.data);
  const totalCount = typeof json.totalCount === 'number' ? json.totalCount : rows.length;
  const pageSizeOut = typeof json.pageSize === 'number' ? json.pageSize : pageSize;
  const pageNumber =
    typeof json.pageNumber === 'number'
      ? json.pageNumber
      : typeof json.pageNo === 'number'
        ? json.pageNo
        : pageNo;
  return {
    rows: sortRowsByDate(rows),
    totalCount,
    pageNumber,
    pageSize: pageSizeOut,
  };
}

/** Whether another page of older messages exists after loading `pageNumber` (0-based). */
export function hasMoreHistoryPages(
  totalCount: number,
  pageNumber: number,
  pageSize: number
): boolean {
  if (totalCount <= 0 || pageSize <= 0) return false;
  return (pageNumber + 1) * pageSize < totalCount;
}

export function paginationStateAfterPage(
  page: ByConversationPageResult,
  loadingOlder: boolean
): ChatHistoryPagination {
  const nextPageNo = hasMoreHistoryPages(page.totalCount, page.pageNumber, page.pageSize)
    ? page.pageNumber + 1
    : null;
  return {
    pageSize: page.pageSize,
    nextPageNo,
    totalCount: page.totalCount,
    loadingOlder,
  };
}

/**
 * Loads messages for one conversation (full thread where supported).
 * Primary: paginated by-conversation endpoint (large page).
 * Falls back to older query/path shapes, then to filtering a global feed.
 */
export async function fetchConversationThread(
  conversationId: string,
  options?: { pageNo?: number; pageSize?: number }
): Promise<ConversationHistoryRow[]> {
  const cid = conversationId.trim();
  const pageNo = options?.pageNo ?? 0;
  const pageSize = options?.pageSize ?? 500;

  const page = await fetchConversationByConversationPage(cid, pageNo, pageSize);
  if (page) {
    return page.rows;
  }

  const base = getConversationHistoryBaseUrl();
  const headers = authHeaders();

  const tries = [
    `${base}/Conversation?conversationId=${encodeURIComponent(cid)}&pageNumber=1&pageSize=500`,
    `${base}/Conversation/${encodeURIComponent(cid)}?pageNumber=1&pageSize=500`,
  ];

  for (const url of tries) {
    const res = await fetch(url, { headers });
    if (!res.ok) continue;
    const json = (await res.json()) as { data?: unknown[] };
    const all = normalizeConversationHistoryRows(json.data);
    if (all.length === 0) continue;
    return sortRowsByDate(all);
  }

  const wide = await fetchConversationHistoryPage(1, 500);
  const rows = (wide.data ?? []).filter((r) => r.conversationId === cid);
  return sortRowsByDate(rows);
}

/** API uses `role: "bot"` for assistant; `null` or any other value is treated as user (see api sample). */
export function isBotRole(role: string | null | undefined): boolean {
  return typeof role === 'string' && role.trim().toLowerCase() === 'bot';
}

function generateChatTitleFromText(text: string): string {
  const words = text.trim().split(/\s+/);
  const title = words.slice(0, 8).join(' ');
  return title.length < text.trim().length ? `${title}…` : title;
}

function rowToMessage(row: ConversationHistoryRow): Message {
  const isAssistant = isBotRole(row.role);
  return {
    id: row.id,
    type: isAssistant ? 'assistant' : 'user',
    content: row.text ?? '',
    timestamp: new Date(row.creationDate),
  };
}

function titleForGroup(sortedRows: ConversationHistoryRow[]): string {
  const firstUser = sortedRows.find((r) => !isBotRole(r.role));
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
