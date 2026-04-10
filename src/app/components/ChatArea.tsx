import { Pencil, Mic, ArrowUp, ArrowDown, Copy, Download, Play, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  selectCurrentChat,
  selectAttachedFiles,
  addMessage,
  clearAttachments,
  addAttachment,
  removeAttachment,
  setChatBackendContext,
  updateMessageContent,
  prependChatMessages,
  setChatHistoryLoadingOlder,
} from '../store/chatSlice';
import { selectUserInitials } from '../store/userSlice';
import type { Message } from '../store/chatSlice';
import { ChatMarkdown } from './ChatMarkdown';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { store } from '../store';
import { startConversation, continueConversation } from '../backend/basicchatApi';
import {
  connectSignalR,
  generateSessionId,
  joinConversation,
  joinUserIdGroup,
  disconnectSignalR,
  type StreamChatPayload,
} from '../backend/signalRService';
import { getHrmsAccessToken } from '../backend/config';
import {
  fetchConversationByConversationPage,
  rowsToMessages,
  paginationStateAfterPage,
} from '../backend/conversationHistoryApi';
import { tryParseJsonListCards, JsonListTable } from './hrListDataCards';
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from './ui/utils';
import { formatSpeechStartError, getSpeechEngineMode, startSpeechCapture } from '../speech/speechEngine';

/** Recharts tooltip/legend — module scope avoids repeating inline style objects in JSX. */
const RECHARTS_TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-sm)',
  boxShadow: 'var(--shadow-surface)',
} as const;

const RECHARTS_LEGEND_STYLE = {
  fontSize: 'var(--text-sm)',
  color: 'var(--foreground)',
} as const;

/** True when running in the HR portal embed iframe (widget); layout tweaks only. */
function isEmbeddedHrWidget(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1">
      <div className="chat-loading-dot w-2 h-2 rounded-full" />
      <div className="chat-loading-dot w-2 h-2 rounded-full" />
      <div className="chat-loading-dot w-2 h-2 rounded-full" />
    </div>
  );
}

const STREAM_IDLE_END_MS = 100_000;
const NO_STREAM_FALLBACK_WITH_HTTP_TEXT_MS = 100_000;
const NO_STREAM_FALLBACK_WITHOUT_HTTP_TEXT_MS = 100_000;

/** Pass through backend / SignalR assistant text verbatim (no generic error replacement). */
function sanitizeAssistantContent(content: string): string {
  return content ?? '';
}

function normalizeBackendId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function isLikelyMongoObjectId(value: string | undefined): boolean {
  return Boolean(value && /^[a-f0-9]{24}$/i.test(value));
}

function shouldRetryContinueAsStart(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('400') ||
    lower.includes('no conversationid') ||
    lower.includes('processing the message') ||
    lower.includes('conversation not found')
  );
}

/** Last assistant in a consecutive block (next message is user or none). Message-level copy only here; JsonListTable copy is separate. */
function isLastInAssistantRun(messages: Message[], index: number): boolean {
  const m = messages[index];
  if (!m || m.type !== 'assistant') return false;
  const next = messages[index + 1];
  return !next || next.type === 'user';
}

/** ChatGPT-style: preceding user message (if any) + every assistant bubble in this turn, joined for clipboard. */
function clipboardTextForAssistantTurn(messages: Message[], lastIndexInRun: number): string {
  let start = lastIndexInRun;
  while (start > 0 && messages[start - 1].type === 'assistant') start--;
  const segments: string[] = [];
  if (start > 0 && messages[start - 1].type === 'user') {
    segments.push(`User:\n${messages[start - 1].content ?? ''}`);
  }
  for (
    let i = start;
    i <= lastIndexInRun && i < messages.length && messages[i].type === 'assistant';
    i++
  ) {
    segments.push(messages[i].content ?? '');
  }
  return segments.join('\n\n');
}

/** Attachments entry point is disabled until the feature ships. */
function DisabledAttachPlusButton() {
  return (
    <UiTooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 cursor-not-allowed">
          <button
            type="button"
            disabled
            className="flex-shrink-0 cursor-not-allowed rounded-md border-0 bg-transparent p-0 opacity-50"
            aria-label="Add attachment (coming soon)"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-foreground">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        Coming soon
      </TooltipContent>
    </UiTooltip>
  );
}

export function ChatArea() {
  const dispatch = useAppDispatch();
  const userInitials = useAppSelector(selectUserInitials);
  const currentChat = useAppSelector(selectCurrentChat);
  const attachedFiles = useAppSelector(selectAttachedFiles);
  const messages = currentChat?.messages || [];
  
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  /**
   * True while SignalR stream chunks are actively arriving.
   * Kept separate from isLoading so the send button stays disabled until the
   * complete response has been streamed, even after the HTTP call returns.
   */
  const [isStreaming, setIsStreaming] = useState(false);
  const activeChatIdRef = useRef<string | null>(null);
  /**
   * Stable client-owned SignalR group id used for streaming assistant chunks.
   * The backend will stream to the supplied sessionId on start/continue when present.
   */
  const activeSessionIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const speechCaptureRef = useRef<Awaited<ReturnType<typeof startSpeechCapture>> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);
  const pendingStreamMessageIdRef = useRef<string | null>(null);
  const pendingStreamBackendMessageIdRef = useRef<string | null>(null);
  const pendingStreamHasChunksRef = useRef<boolean>(false);
  const streamHasExplicitFinalFlagRef = useRef<boolean>(false);
  /** Accumulate all StreamChat(chunk) for the current response; then bind full content to one message (backend does not send in one go). */
  const streamedContentRef = useRef<string>('');

  // RAF handle — batches rapid chunk dispatches into at most one Redux update per animation frame
  const rafRef = useRef<number | null>(null);
  // Stream completion timer:
  // - no explicit final flag: 2 s idle timer
  // - explicit final flag mode: long safety timer only (final chunk should close immediately)
  const streamEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fallback: if no chunks ever arrive within 10 s of the HTTP response, unblock the input
  const noStreamFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the current start/continue HTTP request is still running.
  // Streams should not be finalized while this is true.
  const requestInFlightRef = useRef<boolean>(false);
  // Capture chat id at send start so we can show error in the right chat even if state changes.
  const sendChatIdRef = useRef<string | null>(null);
  /** When true, skip auto scroll-to-bottom (e.g. after prepending older history). */
  const skipScrollToBottomRef = useRef(false);
  const loadingOlderInFlightRef = useRef(false);
  const embeddedWidget = isEmbeddedHrWidget();
  useEffect(() => {
    activeChatIdRef.current = currentChat?.id ?? null;
    activeSessionIdRef.current = currentChat?.backendSessionId ?? null;
  }, [currentChat?.id, currentChat?.backendSessionId]);

  // Effect 1: Establish a single persistent SignalR connection for the lifetime of this component.
  // IMPORTANT: Do NOT add backendSessionId to the dependency array.
  // Adding it would cause React to run cleanup (disconnectSignalR) every time a new session is
  // assigned from the HTTP response — killing the connection exactly while the backend is streaming
  // chunks, resulting in partial/truncated responses ("It", "This", etc.).
  useEffect(() => {
    if (!getHrmsAccessToken()) return;

    let mounted = true;

    /** Flush accumulated stream content to Redux — called via RAF to batch rapid chunks. */
    const flushChunkToRedux = () => {
      rafRef.current = null;
      const chatId = activeChatIdRef.current;
      const messageId = pendingStreamMessageIdRef.current;
      if (chatId && messageId) {
        dispatch(updateMessageContent({
          chatId,
          messageId,
          content: sanitizeAssistantContent(streamedContentRef.current),
        }));
      }
    };

    /** Mark the stream as finished, re-enable input, and do a final Redux flush. */
    const finalizeStream = (force = false) => {
      // Do not split one backend turn into multiple bubbles if there is a
      // temporary pause between chunks while the HTTP request is still active.
      if (!force && requestInFlightRef.current) {
        streamEndTimerRef.current = setTimeout(finalizeStream, 2000);
        return;
      }
      streamEndTimerRef.current = null;
      // Cancel any pending RAF — we'll do the final flush ourselves
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const chatId = activeChatIdRef.current;
      const messageId = pendingStreamMessageIdRef.current;
      if (chatId && messageId) {
        dispatch(updateMessageContent({
          chatId,
          messageId,
          content: sanitizeAssistantContent(streamedContentRef.current),
        }));
      }
      pendingStreamMessageIdRef.current = null;
      pendingStreamBackendMessageIdRef.current = null;
      pendingStreamHasChunksRef.current = false;
      streamHasExplicitFinalFlagRef.current = false;
      setIsStreaming(false);
      setIsLoading(false);
    };

    connectSignalR({
      onStreamChat: (payload: StreamChatPayload) => {
        if (!mounted) return;
        const chatId = activeChatIdRef.current;
        if (!chatId) return;

        const backendMessageId = normalizeBackendId(payload.messageId);
        if (backendMessageId && !pendingStreamBackendMessageIdRef.current) {
          pendingStreamBackendMessageIdRef.current = backendMessageId;
        }

        const rawChunk = payload.content === null || payload.content === undefined ? '' : String(payload.content);
        const hasInlineFinalMarker = rawChunk.includes('###final###');
        const chunkText = rawChunk.replace(/###final###/g, '');
        const hasExplicitFinalFlag = typeof payload.isFinalChunk === 'boolean';
        if (hasExplicitFinalFlag) {
          streamHasExplicitFinalFlagRef.current = true;
        }
        const isFinalChunk = payload.isFinalChunk === true || hasInlineFinalMarker;
        // Ignore empty/metadata-only chunks. These can arrive from backend framing
        // and should not create/advance the visible assistant response.
        if (!chunkText.trim() && !isFinalChunk) return;

        // First chunk of a new response — create the placeholder bubble
        if (!pendingStreamMessageIdRef.current) {
          const messageId = backendMessageId
            ? `stream-${chatId}-${backendMessageId}`
            : `stream-${chatId}-${Date.now()}`;
          pendingStreamMessageIdRef.current = messageId;
          pendingStreamHasChunksRef.current = false;
          streamedContentRef.current = '';
          dispatch(addMessage({ id: messageId, type: 'assistant', content: '', timestamp: new Date() }));
          setIsStreaming(true);
          // Cancel the no-stream fallback — chunks are arriving
          if (noStreamFallbackRef.current !== null) {
            clearTimeout(noStreamFallbackRef.current);
            noStreamFallbackRef.current = null;
          }
        }

        if (chunkText) {
          streamedContentRef.current += chunkText;
        }
        pendingStreamHasChunksRef.current = true;

        // Throttle Redux dispatches with RAF — at most one update per animation frame
        // instead of one per chunk. This prevents hundreds of dispatches/second that
        // cause the "message channel closed" browser error and excessive re-renders.
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(flushChunkToRedux);
        }

        if (isFinalChunk) {
          finalizeStream(true);
          return;
        }

        // Recco-style: when backend provides explicit isFinalChunk, avoid short idle
        // cutoffs that can truncate responses during temporary generation pauses.
        if (streamEndTimerRef.current !== null) {
          clearTimeout(streamEndTimerRef.current);
        }
        if (streamHasExplicitFinalFlagRef.current) {
          streamEndTimerRef.current = setTimeout(() => finalizeStream(true), 45_000);
        } else {
          streamEndTimerRef.current = setTimeout(finalizeStream, STREAM_IDLE_END_MS);
        }
      },
      onCardMessage: (payload) => {
        if (!mounted) return;
        const chatId = activeChatIdRef.current;
        if (!chatId || !payload.content?.trim()) return;
        const pendingMessageId = pendingStreamMessageIdRef.current;
        const sanitizedContent = sanitizeAssistantContent(payload.content);
        if (pendingMessageId && !pendingStreamHasChunksRef.current) {
          dispatch(updateMessageContent({ chatId, messageId: pendingMessageId, content: sanitizedContent }));
        } else {
          dispatch(addMessage({ id: `srv-${Date.now()}`, type: 'assistant', content: sanitizedContent, timestamp: new Date() }));
        }
        pendingStreamMessageIdRef.current = null;
        pendingStreamBackendMessageIdRef.current = null;
        pendingStreamHasChunksRef.current = false;
        streamHasExplicitFinalFlagRef.current = false;
        streamedContentRef.current = '';
        if (payload.conversationId) {
          dispatch(setChatBackendContext({ chatId, conversationId: payload.conversationId }));
        }
        setIsStreaming(false);
        setIsLoading(false);
      },
    })
      .then(async () => {
        if (!mounted) return;
        try {
          // Join ownerId group — backend sends StreamChat to this group (ChatHub.OnConnectedAsync).
          await joinUserIdGroup();
          // If we already have a session (e.g. component re-mounted), rejoin it too.
          const sessionId = activeSessionIdRef.current;
          if (sessionId) await joinConversation(sessionId);
        } catch (err) {
          console.error('[SignalR] Failed to join group/conversation:', err);
        }
      })
      .catch((err) => {
        console.error('[SignalR] Connection failed:', err);
      });

    return () => {
      mounted = false;
      requestInFlightRef.current = false;
      pendingStreamBackendMessageIdRef.current = null;
      streamHasExplicitFinalFlagRef.current = false;
      // Clean up all timers/RAF to avoid state updates on unmounted component
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (streamEndTimerRef.current !== null) clearTimeout(streamEndTimerRef.current);
      if (noStreamFallbackRef.current !== null) clearTimeout(noStreamFallbackRef.current);
      disconnectSignalR();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]); // Intentionally omit backendSessionId — see comment above.

  // Effect 2: When a new session ID is assigned (after first HTTP response), join its SignalR group.
  // This runs on top of the existing live connection — no disconnect/reconnect.
  useEffect(() => {
    const sessionId = currentChat?.backendSessionId;
    if (!sessionId) return;
    joinConversation(sessionId).catch((err) =>
      console.warn('[SignalR] Failed to join session group:', err)
    );
  }, [currentChat?.backendSessionId]);

  const fieldSizingSupported =
    typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');

  // Auto-resize textarea when `field-sizing: content` is not supported (see .ui-composer-textarea in app-ui.css)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || fieldSizingSupported) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
    setIsMultiline(newHeight > 30);
  }, [inputValue, fieldSizingSupported]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !fieldSizingSupported) return;
    const ro = new ResizeObserver(() => {
      setIsMultiline(el.offsetHeight > 30);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fieldSizingSupported]);

  const handleSend = async () => {
    if (!inputValue.trim() && attachedFiles.length === 0) return;
    if (isLoading || isStreaming) return;

    const userText = inputValue;
    const newMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: userText,
      timestamp: new Date(),
      attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    dispatch(addMessage(newMessage));
    setInputValue('');
    dispatch(clearAttachments());

    setIsLoading(true);
    setIsStreaming(false);
    requestInFlightRef.current = true;

    // Clear any leftover timers from a previous send
    if (streamEndTimerRef.current !== null) {
      clearTimeout(streamEndTimerRef.current);
      streamEndTimerRef.current = null;
    }
    if (noStreamFallbackRef.current !== null) {
      clearTimeout(noStreamFallbackRef.current);
      noStreamFallbackRef.current = null;
    }

    // Create the placeholder bubble up front. The SignalR onStreamChat handler will
    // fill it as chunks arrive. If no stream starts, the fallback timer fills it or shows the error.
    const pendingMessageId = `stream-${Date.now()}`;
    pendingStreamMessageIdRef.current = pendingMessageId;
    pendingStreamBackendMessageIdRef.current = null;
    pendingStreamHasChunksRef.current = false;
    streamHasExplicitFinalFlagRef.current = false;
    streamedContentRef.current = '';
    dispatch(addMessage({
      id: pendingMessageId,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
    }));

    try {
      // Redux state update is synchronous; we can read chat id/context right after dispatch.
      const state = store.getState();
      const chatId = state.chat.currentChatId;
      sendChatIdRef.current = chatId;
      const chat = chatId ? state.chat.chats.find(c => c.id === chatId) : null;

      const conversationIdForContinue = normalizeBackendId(chat?.backendConversationId);
      const hasConversation = isLikelyMongoObjectId(conversationIdForContinue);
      let streamSessionId = chat?.backendSessionId;

      // This backend streams to the supplied sessionId group when present.
      // Create/join a stable client session before the first turn so the initial
      // streamed response does not get lost.
      if (!streamSessionId) {
        streamSessionId = generateSessionId();
        await joinConversation(streamSessionId).catch((err) =>
          console.warn('[SignalR] Failed to join generated session group:', err)
        );
        if (chatId) {
          dispatch(setChatBackendContext({
            chatId,
            sessionId: streamSessionId,
          }));
        }
      }

      let resp;
      if (hasConversation) {
        try {
          resp = await continueConversation({
            text: userText,
            conversationId: conversationIdForContinue ?? '',
            sessionId: streamSessionId,
          });
        } catch (continueErr) {
          if (!shouldRetryContinueAsStart(continueErr)) throw continueErr;
          // Recover from stale/invalid conversation context by starting a fresh backend conversation.
          try {
            resp = await startConversation({
              message: userText,
              sessionId: streamSessionId ?? undefined,
            });
          } catch (startErr) {
            // Some backend flows reject explicit sessionId values; retry once without it.
            if (!shouldRetryContinueAsStart(startErr)) throw startErr;
            resp = await startConversation({
              message: userText,
            });
          }
        }
      } else {
        try {
          resp = await startConversation({
            message: userText,
            sessionId: streamSessionId ?? undefined,
          });
        } catch (startErr) {
          // Some backend flows reject explicit sessionId values; retry once without it.
          if (!shouldRetryContinueAsStart(startErr)) throw startErr;
          resp = await startConversation({
            message: userText,
          });
        }
      }

      const conversationIdFromResp: string | undefined = normalizeBackendId(resp.conversationId);
      const sessionIdFromResp: string | undefined = normalizeBackendId(resp.sessionId);
      const stageFromResp: string | undefined = resp.stage;

      if (chatId) {
        dispatch(setChatBackendContext({
          chatId,
          conversationId: conversationIdFromResp,
          sessionId: sessionIdFromResp ?? streamSessionId ?? undefined,
          stage: stageFromResp,
        }));
      }

      const assistantTextRaw = resp.text;
      const assistantText = sanitizeAssistantContent((assistantTextRaw ?? '').toString());
      const hasHttpAssistantText = Boolean(assistantText.trim());
      if (chatId && assistantText && !pendingStreamHasChunksRef.current) {
        dispatch(updateMessageContent({
          chatId,
          messageId: pendingMessageId,
          content: assistantText,
        }));
      }
      if (sessionIdFromResp) {
        joinConversation(sessionIdFromResp).catch((err) =>
          console.warn('[SignalR] Failed to join response session group:', err)
        );
      }
      requestInFlightRef.current = false;

      // HTTP returned — start a fallback timer.
      // If no SignalR chunks arrive within 10 s of the HTTP response, assume there is no
      // stream for this turn and unblock the input.
      if (!pendingStreamHasChunksRef.current) {
        noStreamFallbackRef.current = setTimeout(() => {
          noStreamFallbackRef.current = null;
          if (!pendingStreamHasChunksRef.current && !requestInFlightRef.current) {
            // No chunks received — HTTP text (if any) is already in the bubble; we're done.
            pendingStreamMessageIdRef.current = null;
            pendingStreamBackendMessageIdRef.current = null;
            setIsLoading(false);
            setIsStreaming(false);
          }
        }, hasHttpAssistantText ? NO_STREAM_FALLBACK_WITH_HTTP_TEXT_MS : NO_STREAM_FALLBACK_WITHOUT_HTTP_TEXT_MS);
      }
    } catch (err) {
      requestInFlightRef.current = false;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const state = store.getState();
      const chatId = state.chat.currentChatId ?? sendChatIdRef.current;
      if (chatId) {
        dispatch(updateMessageContent({
          chatId,
          messageId: pendingMessageId,
          content: `Backend error: ${msg}`,
        }));
      }
      // On HTTP error there will be no stream — unblock immediately
      pendingStreamMessageIdRef.current = null;
      pendingStreamBackendMessageIdRef.current = null;
      streamHasExplicitFinalFlagRef.current = false;
      setIsLoading(false);
      setIsStreaming(false);
    }
    // NOTE: No finally block — isLoading is released by either:
    //   a) The stream-end timer (2 s after last chunk) — normal streaming flow
    //   b) The no-stream fallback timer (10 s, if no chunks arrive) — non-streaming responses
    //   c) The catch block above — on HTTP error
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyCode = (code: string) => {
    // Fallback method for clipboard copy
    try {
      navigator.clipboard.writeText(code).catch(() => {
        // Fallback to legacy method
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.className = 'ui-copy-fallback-textarea';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Failed to copy code:', err);
        }
        document.body.removeChild(textArea);
      });
    } catch (err) {
      // If clipboard API is not available, use legacy method
      const textArea = document.createElement('textarea');
      textArea.value = code;
      textArea.className = 'ui-copy-fallback-textarea';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (e) {
        console.error('Failed to copy code:', e);
      }
      document.body.removeChild(textArea);
    }
  };

  useEffect(() => {
    if (skipScrollToBottomRef.current) {
      skipScrollToBottomRef.current = false;
      return;
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const loadOlderMessages = useCallback(async () => {
    const state = store.getState().chat;
    const chatId = state.currentChatId;
    const chat = chatId ? state.chats.find((c) => c.id === chatId) : undefined;
    if (!chat?.backendConversationId) return;
    const pg = chat.historyPagination;
    if (!pg?.nextPageNo || pg.loadingOlder || loadingOlderInFlightRef.current) return;

    const el = chatScrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;

    loadingOlderInFlightRef.current = true;
    dispatch(setChatHistoryLoadingOlder({ chatId: chat.id, loading: true }));

    try {
      const page = await fetchConversationByConversationPage(
        chat.backendConversationId,
        pg.nextPageNo,
        pg.pageSize
      );
      if (!page) {
        dispatch(setChatHistoryLoadingOlder({ chatId: chat.id, loading: false }));
        return;
      }

      const older = rowsToMessages(page.rows);
      skipScrollToBottomRef.current = true;
      dispatch(
        prependChatMessages({
          chatId: chat.id,
          messages: older,
          historyPagination: paginationStateAfterPage(page, false),
        })
      );

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scrollEl = chatScrollRef.current;
          if (scrollEl) {
            const delta = scrollEl.scrollHeight - prevScrollHeight;
            scrollEl.scrollTop += delta;
          }
        });
      });
    } catch {
      dispatch(setChatHistoryLoadingOlder({ chatId: chat.id, loading: false }));
    } finally {
      loadingOlderInFlightRef.current = false;
    }
  }, [dispatch]);

  const handleScroll = () => {
    if (chatScrollRef.current) {
      const currentRef = chatScrollRef.current;
      const scrollThreshold = 200; // Show button only if scrolled up more than 200px from bottom
      const distanceFromBottom = currentRef.scrollHeight - currentRef.scrollTop - currentRef.clientHeight;

      if (distanceFromBottom > scrollThreshold) {
        setShowScrollButton(true);
      } else {
        setShowScrollButton(false);
      }

      const topThreshold = 120;
      if (
        currentRef.scrollTop < topThreshold &&
        currentChat?.backendConversationId &&
        currentChat.historyPagination?.nextPageNo != null &&
        !currentChat.historyPagination.loadingOlder &&
        !loadingOlderInFlightRef.current
      ) {
        void loadOlderMessages();
      }
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        const isImage = file.type.startsWith('image/');
        const preview = isImage ? URL.createObjectURL(file) : undefined;
        dispatch(addAttachment({ file, type: isImage ? 'image' : 'document', preview }));
      });
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFiles = (files: FileList) => {
    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/');
      const preview = isImage ? URL.createObjectURL(file) : undefined;
      dispatch(addAttachment({ file, type: isImage ? 'image' : 'document', preview }));
    });
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if we're leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const handleMicClick = async () => {
    if (getSpeechEngineMode() === 'none') {
      setSpeechError(
        'Speech input is not available here. Use Chrome or Edge for built-in dictation, or set VITE_SPEECH_WEBSOCKET_URL for server-side transcription (same pattern as Recco.App).'
      );
      return;
    }
    setSpeechError(null);
    try {
      const capture = await startSpeechCapture((levels) => setAudioLevels(levels));
      speechCaptureRef.current = capture;
      setIsListening(true);
    } catch (e) {
      setSpeechError(formatSpeechStartError(e));
      setAudioLevels([]);
    }
  };

  const handleConfirmVoice = async () => {
    const cap = speechCaptureRef.current;
    speechCaptureRef.current = null;
    setIsListening(false);
    setAudioLevels([]);
    setSpeechError(null);
    if (!cap) return;
    const text = await cap.finalize(true);
    if (text) {
      setInputValue((prev) => [prev.trim(), text].filter(Boolean).join(' ').trim());
    }
  };

  const handleCancelVoice = async () => {
    const cap = speechCaptureRef.current;
    speechCaptureRef.current = null;
    setIsListening(false);
    setAudioLevels([]);
    setSpeechError(null);
    if (cap) await cap.finalize(false);
  };

  useEffect(() => {
    return () => {
      const cap = speechCaptureRef.current;
      speechCaptureRef.current = null;
      if (cap) void cap.finalize(false);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative transition-[background-color] duration-300 ease-out">
      {/* Chat messages area */}
      <div
        className={cn(
          'ui-themed-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-smooth',
          embeddedWidget && 'hr-widget-chat-scroll'
        )}
        ref={chatScrollRef}
        onScroll={handleScroll}
      >
        <div
          className={cn(
            'chat-main-container',
            embeddedWidget ? 'py-4' : 'py-6 sm:py-8'
          )}
        >
          {currentChat?.historyPagination?.loadingOlder && (
            <div className="ui-history-loading text-center py-3 mb-4 rounded-lg border border-border/40 ui-loading-strip">
              Loading older messages…
            </div>
          )}
          {/* Empty state for new chats */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] sm:min-h-[60vh] text-center px-2">
              <div className="mb-8 ui-empty-state-hero">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ui-empty-icon-wrap">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-primary">
                    <path
                      d="M20 8v24M8 20h24"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h2 className="font-app text-[length:var(--text-2xl)] font-bold text-foreground mb-3">
                  What can I help with?
                </h2>
                <p className="font-app text-[length:var(--text-base)] text-foreground/60">
                  Start a conversation by typing a message below
                </p>
              </div>
            </div>
          )}
          
          {messages.map((message, msgIndex) => {
            const isLastMessage = msgIndex === messages.length - 1;
            const isStreamingPlaceholder = isLastMessage && message.type === 'assistant' && !message.content?.trim() && (isLoading || isStreaming);
            const isTrulyEmptyAssistantMessage =
              message.type === 'assistant' &&
              !isStreamingPlaceholder &&
              !message.content?.trim() &&
              !(message.codeBlocks && message.codeBlocks.length > 0) &&
              !(message.images && message.images.length > 0) &&
              !(message.charts && message.charts.length > 0) &&
              !(message.files && message.files.length > 0) &&
              !message.audio;

            // Guardrail: skip rendering stale empty assistant shells after stream completion.
            // This hides empty bubbles without dropping any meaningful chat content.
            if (isTrulyEmptyAssistantMessage) return null;

            const jsonListParse =
              message.type === 'assistant' && !isStreamingPlaceholder
                ? tryParseJsonListCards(message.content)
                : null;
            return (
            <div key={message.id} className="mb-8 ui-chat-turn">
              {message.type === 'user' ? (
                // User message
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ui-avatar-primary shadow-sm">
                    <span className="ui-avatar-primary-text">{userInitials}</span>
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    {/* User attachments pills - same style but without X button */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div 
                        className="flex items-center gap-2 flex-wrap mb-3"
                      >
                        {message.attachments.map((attachment, index) => (
                          <div
                            key={index}
                            className="ui-attachment-pill flex items-center gap-2 px-3 py-1.5 rounded-full flex-shrink-0"
                          >
                            {attachment.type === 'image' ? (
                              <>
                                <ImageIcon size={14} className="text-foreground/70 shrink-0" />
                                <span className="text-xs max-w-[120px] sm:max-w-[200px] truncate text-foreground">
                                  {attachment.file.name}
                                </span>
                              </>
                            ) : (
                              <>
                                <FileText size={14} className="text-foreground/70 shrink-0" />
                                <span className="text-xs max-w-[120px] sm:max-w-[200px] truncate text-foreground">
                                  {attachment.file.name}
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="font-app text-[length:var(--text-base)] text-foreground break-words">
                      {message.content}
                    </div>
                  </div>
                </div>
              ) : (
                // Assistant message
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ui-avatar-accent shadow-sm text-accent-foreground">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M8 1L10.5 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H5.5L8 1Z"
                        fill="currentColor"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    {/* Message content with Markdown support; show typing indicator when this is the streaming placeholder */}
                    {isStreamingPlaceholder ? (
                      <div className="flex items-center h-8">
                        <LoadingDots />
                      </div>
                    ) : jsonListParse?.variant === 'i9' ? (
                      <JsonListTable rows={jsonListParse.payload.Data as Record<string, unknown>[]} onCopyTable={copyCode} />
                    ) : jsonListParse?.variant === 'array' ? (
                      <JsonListTable rows={jsonListParse.rows} onCopyTable={copyCode} />
                    ) : (
                    <ChatMarkdown className="chat-markdown markdown-text min-w-0 leading-tight" markdown={message.content} />
                    )}

                    {!jsonListParse && (
                    <>
                    {/* Code blocks */}
                    {message.codeBlocks && message.codeBlocks.map((block, blockIdx) => (
                      <div key={blockIdx} className="my-4 rounded-lg overflow-hidden ui-chat-code-block ui-surface-card">
                        <div className="ui-chat-code-toolbar flex items-center justify-between px-4 py-2 border-b border-border">
                          <span className="text-app-xs text-foreground/70">{block.language}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyCode(block.code)}
                              className="p-1 rounded-md hover:bg-background/50 transition-colors ui-msg-action-btn"
                              title="Copy code"
                              type="button"
                            >
                              <Copy size={14} className="text-foreground/70" />
                            </button>
                            <button className="p-1 rounded-md hover:bg-background/50 transition-colors ui-msg-action-btn" title="Edit" type="button">
                              <Pencil size={14} className="text-foreground/70" />
                            </button>
                            <button className="p-1 rounded-md hover:bg-background/50 transition-colors ui-msg-action-btn" title="Insert below" type="button">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-foreground/70">
                                <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </button>
                            <button className="p-1 rounded-md hover:bg-background/50 transition-colors ui-msg-action-btn" title="Run" type="button">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-foreground/70">
                                <path d="M4 2l8 5-8 5V2z" fill="currentColor"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="px-4 py-3 ui-chat-code-body">{block.code}</div>
                      </div>
                    ))}

                    {/* Additional text after code blocks */}
                    {message.codeBlocks && (
                      <div className="mt-4 font-app text-[length:var(--text-base)] text-foreground leading-relaxed">
                        <p className="mb-4">They'll give you 95% of the same visual feel.</p>
                        <p>If you'd like, I can extract and inspect the exact SVG paths from the uploaded screenshot and match them more precisely.</p>
                      </div>
                    )}

                    {/* Images */}
                    {message.images && message.images.map((image, imgIdx) => (
                      <div key={imgIdx} className="my-4 rounded-lg overflow-hidden ui-surface-card">
                        <img
                          src={image.url}
                          alt={image.alt || 'Generated image'}
                          className="w-full h-auto block"
                        />
                        {image.caption && (
                          <div className="px-4 py-3 border-t border-border/60 text-sm text-muted-foreground">
                            {image.caption}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Charts */}
                    {message.charts && message.charts.map((chart, chartIdx) => (
                      <div key={chartIdx} className="ui-chart-block ui-chart-card my-4 rounded-lg overflow-hidden p-4 max-w-full">
                        {chart.title && (
                          <h4 className="ui-chart-title">{chart.title}</h4>
                        )}
                        <div className="w-full min-h-[220px] sm:min-h-[300px] h-[220px] sm:h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                          {chart.type === 'bar' ? (
                            <BarChart data={chart.data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                              <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
                              <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
                              <Tooltip contentStyle={{ ...RECHARTS_TOOLTIP_STYLE }} />
                              <Legend wrapperStyle={{ ...RECHARTS_LEGEND_STYLE }} />
                              <Bar dataKey="usage" fill="var(--primary)" />
                            </BarChart>
                          ) : (
                            <LineChart data={chart.data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                              <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
                              <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
                              <Tooltip contentStyle={{ ...RECHARTS_TOOLTIP_STYLE }} />
                              <Legend wrapperStyle={{ ...RECHARTS_LEGEND_STYLE }} />
                              <Line type="monotone" dataKey="usage" stroke="var(--primary)" />
                            </LineChart>
                          )}
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ))}

                    {/* File Attachments */}
                    {message.files && message.files.length > 0 && (
                      <div className="my-4 space-y-2">
                        {message.files.map((file, fileIdx) => (
                          <div
                            key={fileIdx}
                            className="ui-file-attachment-row flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/20 transition-colors cursor-pointer"
                          >
                            <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 bg-muted border border-border/50 shadow-inner">
                              <FileText size={20} className="text-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-app-sm font-medium text-foreground mb-0.5 truncate">
                                {file.name}
                              </div>
                              <div className="text-app-xs text-muted-foreground">
                                {file.type} • {file.size}
                              </div>
                            </div>
                            <button
                              className="flex-shrink-0 p-2 rounded-md hover:bg-muted/30 transition-colors border border-transparent hover:border-border/50"
                              title="Download"
                              type="button"
                            >
                              <Download size={18} className="text-foreground" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Audio Player */}
                    {message.audio && (
                      <div className="my-4 rounded-lg p-4 ui-surface-card">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <button
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm border border-primary/20"
                            title="Play audio"
                            type="button"
                          >
                            <Play size={18} fill="currentColor" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-app-sm font-medium text-foreground mb-2 truncate">
                              {message.audio.title || 'Audio Response'}
                            </div>
                            <div className="relative h-1.5 rounded-full overflow-hidden ui-audio-progress-track border border-border/30">
                              <div className="absolute top-0 left-0 h-full w-0 rounded-full ui-audio-progress-fill" />
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-app-xs text-muted-foreground">0:00</span>
                              <span className="text-app-xs text-muted-foreground">2:34</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    </>
                    )}

                    {/* Copy full turn (user + all assistant parts) — only on last assistant bubble; no row under table — JsonListTable keeps its own copy */}
                    {!isStreamingPlaceholder &&
                      !jsonListParse &&
                      isLastInAssistantRun(messages, msgIndex) && (
                        <div className="flex items-center gap-1 sm:gap-2 mt-4 flex-wrap">
                          <button
                            className="ui-msg-action-btn p-1.5 rounded-md border border-transparent hover:border-border/40"
                            title="Copy conversation"
                            type="button"
                            onClick={() => copyCode(clipboardTextForAssistantTurn(messages, msgIndex))}
                          >
                            <Copy size={16} className="text-foreground/60" />
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          );
          })}
          {/* Only show separate loading row when we don't already have the streaming placeholder (single response bubble) */}
          {(isLoading || isStreaming) && !(messages.length > 0 && messages[messages.length - 1].type === 'assistant' && !messages[messages.length - 1].content?.trim()) && (
            <div className="mb-8 ui-chat-turn">
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ui-avatar-accent shadow-sm text-accent-foreground">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 1L10.5 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H5.5L8 1Z" fill="currentColor" />
                  </svg>
                </div>
                <div className="flex min-h-8 min-w-0 flex-1 items-center">
                  <LoadingDots />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area at bottom */}
      <div className={embeddedWidget ? 'hr-widget-composer-rail' : 'p-3 sm:p-4'}>
        <div
          className="chat-main-container relative"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-10 rounded-[inherit] flex items-center justify-center pointer-events-none ui-drag-overlay ui-drag-overlay-surface">
              <div className="text-center px-2">
                <Paperclip size={32} className="text-foreground/60 mx-auto" />
                <p className="text-app-sm text-foreground/80 mt-2">Drop files here</p>
              </div>
            </div>
          )}

          <div
            className={`ui-input-composer ui-composer-shell flex flex-col gap-3 px-3 sm:px-4 py-3 ${attachedFiles.length > 0 || isMultiline ? 'rounded-3xl' : 'rounded-full'}`}
          >
            {/* Attachment previews inside the input box */}
            {attachedFiles.length > 0 && (
              <div className="ui-themed-scroll flex items-center gap-2 overflow-x-auto pb-1">
                {attachedFiles.map((attachment, index) => (
                  <div
                    key={index}
                    className="ui-attachment-pill flex items-center gap-2 px-3 py-1.5 rounded-full flex-shrink-0"
                  >
                    {attachment.type === 'image' ? (
                      <>
                        <ImageIcon size={14} className="text-foreground/70 shrink-0" />
                        <span className="text-xs max-w-[120px] sm:max-w-[200px] truncate text-foreground">
                          {attachment.file.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <FileText size={14} className="text-foreground/70 shrink-0" />
                        <span className="text-xs max-w-[120px] sm:max-w-[200px] truncate text-foreground">
                          {attachment.file.name}
                        </span>
                      </>
                    )}
                    <button
                      onClick={() => dispatch(removeAttachment(index))}
                      className="ui-pill-remove flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-foreground"
                      title="Remove"
                      type="button"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-foreground">
                        <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            {isListening ? (
              // Listening mode with waveform visualization
              <div className="flex items-center gap-3">
                <DisabledAttachPlusButton />

                {/* Waveform visualization */}
                <div className="flex-1 flex items-center justify-center gap-0.5 h-10 overflow-hidden">
                  {Array.from({ length: 60 }).map((_, i) => {
                    const height = audioLevels[i] || 5;
                    return (
                      <div
                        key={i}
                        className="ui-waveform-bar flex-shrink-0"
                        style={
                          {
                            '--bar-height': `${Math.max(height, 5)}%`,
                          } as CSSProperties
                        }
                      />
                    );
                  })}
                </div>

                {/* Cancel button */}
                <button 
                  className="flex-shrink-0 hover:opacity-70 transition-opacity"
                  onClick={() => void handleCancelVoice()}
                  title="Cancel"
                  type="button"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-foreground">
                    <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>

                {/* Confirm button */}
                <button 
                  className="flex-shrink-0 hover:opacity-70 transition-opacity"
                  onClick={() => void handleConfirmVoice()}
                  title="Confirm"
                  type="button"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-foreground">
                    <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
            <DisabledAttachPlusButton />
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything"
              rows={1}
              className="ui-themed-scroll ui-composer-textarea flex-1 bg-transparent outline-none placeholder:opacity-50 resize-none overflow-y-auto min-h-[24px] max-h-[200px]"
            />
            <div className="flex items-center gap-2">
              <button className="flex-shrink-0 hover:opacity-70 transition-opacity border border-transparent rounded-md" title="Voice input" onClick={() => void handleMicClick()} type="button">
                <Mic size={20} className="text-foreground" />
              </button>
              <button
                onClick={handleSend}
                disabled={
                  isLoading ||
                  isStreaming ||
                  (!inputValue.trim() && attachedFiles.length === 0)
                }
                className="ui-send-btn flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border border-border/30 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  isLoading || isStreaming
                    ? 'Waiting for response…'
                    : !inputValue.trim() && attachedFiles.length === 0
                      ? 'Type a message to send'
                      : 'Send message'
                }
                type="button"
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
            )}
          </div>
          <div className="text-center mt-3 px-2 text-app-xs text-muted-foreground">
            Agent can make mistakes. Check important info.
            {speechError && (
              <span className="block mt-2 text-destructive/90" role="alert">
                {speechError}
              </span>
            )}
            {/* See <span className="underline cursor-pointer hover:opacity-80">Cookie Preferences</span>. */}
          </div>
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-20 sm:bottom-24 left-0 right-0 flex justify-center pointer-events-none px-4">
          <button
            type="button"
            className="ui-scroll-to-bottom ui-scroll-bottom-btn pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center transition-[opacity,transform,box-shadow] duration-200 ease-out hover:opacity-90 hover:scale-105 active:scale-95 border border-border/20"
            onClick={scrollToBottom}
            title="Scroll to bottom"
          >
            <ArrowDown size={20} />
          </button>
        </div>
      )}

      {/* File input */}
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
        multiple
      />
    </div>
  );
}
