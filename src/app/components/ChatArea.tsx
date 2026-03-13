import { Pencil, Mic, ArrowUp, ArrowDown, RotateCw, ThumbsUp, ThumbsDown, Copy, Download, Play, FileText, Image as ImageIcon, Paperclip, MoreHorizontal } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectCurrentChat, selectAttachedFiles, addMessage, clearAttachments, addAttachment, removeAttachment, setChatBackendContext, updateMessageContent } from '../store/chatSlice';
import { selectUserInitials } from '../store/userSlice';
import type { Message } from '../store/chatSlice';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

function LoadingDots() {
  return (
    <div className="flex items-center gap-1">
      <div 
        className="w-2 h-2 rounded-full"
        style={{ 
          backgroundColor: 'var(--foreground)',
          opacity: 0.6,
          animation: 'bounce 1.4s infinite ease-in-out both',
          animationDelay: '-0.32s'
        }}
      />
      <div 
        className="w-2 h-2 rounded-full"
        style={{ 
          backgroundColor: 'var(--foreground)',
          opacity: 0.6,
          animation: 'bounce 1.4s infinite ease-in-out both',
          animationDelay: '-0.16s'
        }}
      />
      <div 
        className="w-2 h-2 rounded-full"
        style={{ 
          backgroundColor: 'var(--foreground)',
          opacity: 0.6,
          animation: 'bounce 1.4s infinite ease-in-out both'
        }}
      />
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

const FALLBACK_ASSISTANT_ERROR_MESSAGE = 'Something went wrong while processing your request. Please try again.';
const STREAM_IDLE_END_MS = 100_000;
const NO_STREAM_FALLBACK_WITH_HTTP_TEXT_MS = 100_000;
const NO_STREAM_FALLBACK_WITHOUT_HTTP_TEXT_MS = 100_000;

function sanitizeAssistantContent(content: string): string {
  const text = (content ?? '').trim();
  if (!text) return content;

  const lower = text.toLowerCase();
  const isIntentCancellationError =
    lower.includes('an unexpected error occurred') &&
    (lower.includes('canceling the intent') ||
      lower.includes('cancelling the intent') ||
      lower.includes('support ticket'));

  return isIntentCancellationError ? FALLBACK_ASSISTANT_ERROR_MESSAGE : content;
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

export function ChatArea() {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector(state => state.theme.isDark);
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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
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

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height based on scrollHeight, with a max of 200px
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
      
      // Check if textarea is multiline (height > single line height ~24px)
      setIsMultiline(newHeight > 30);
    }
  }, [inputValue]);

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
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
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
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
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
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

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
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleAttachMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAttachMenu(!showAttachMenu);
  };

  const handleAttachMenuClose = () => {
    setShowAttachMenu(false);
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

  const toggleVoiceListening = () => {
    setIsListening(!isListening);
    
    if (!isListening) {
      // Start listening - generate random audio levels
      const interval = setInterval(() => {
        const levels = Array.from({ length: 40 }, () => Math.random() * 100);
        setAudioLevels(levels);
      }, 100);
      
      // Store interval ID to clear it later
      (window as any).audioInterval = interval;
    } else {
      // Stop listening
      if ((window as any).audioInterval) {
        clearInterval((window as any).audioInterval);
        (window as any).audioInterval = null;
      }
      setAudioLevels([]);
    }
  };

  const handleConfirmVoice = () => {
    // Simulated speech-to-text result
    setInputValue('This is a simulated transcription of your speech. In a real application, this would use the Web Speech API to convert your voice to text.');
    setIsListening(false);
    setAudioLevels([]);
  };

  const handleCancelVoice = () => {
    setIsListening(false);
    setAudioLevels([]);
  };

  useEffect(() => {
    const currentRef = attachButtonRef.current;
    if (currentRef) {
      const handleClickOutside = (e: MouseEvent) => {
        if (!currentRef.contains(e.target as Node)) {
          handleAttachMenuClose();
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto" ref={chatScrollRef} onScroll={handleScroll}>
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Empty state for new chats */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
              <div className="mb-8">
                <div 
                  className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'var(--primary)', opacity: 0.1 }}
                >
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: 'var(--primary)' }}>
                    <path 
                      d="M20 8v24M8 20h24" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h2 style={{ 
                  fontSize: 'var(--text-2xl)', 
                  fontFamily: 'var(--font-source-sans-pro)',
                  fontWeight: 'var(--font-weight-bold)',
                  color: 'var(--foreground)',
                  marginBottom: '12px'
                }}>
                  What can I help with?
                </h2>
                <p style={{ 
                  fontSize: 'var(--text-base)', 
                  fontFamily: 'var(--font-source-sans-pro)',
                  color: 'var(--foreground)',
                  opacity: 0.6
                }}>
                  Start a conversation by typing a message below
                </p>
              </div>
            </div>
          )}
          
          {messages.map((message, msgIndex) => {
            const isLastMessage = msgIndex === messages.length - 1;
            const isStreamingPlaceholder = isLastMessage && message.type === 'assistant' && !message.content?.trim() && (isLoading || isStreaming);
            return (
            <div key={message.id} className="mb-8">
              {message.type === 'user' ? (
                // User message
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }}>
                    <span style={{ color: 'var(--primary-foreground)', fontSize: 'var(--text-base)', fontFamily: 'var(--font-source-sans-pro)', fontWeight: 'var(--font-weight-semibold)' }}>
                      {userInitials}
                    </span>
                  </div>
                  <div className="flex-1 pt-1">
                    {/* User attachments pills - same style but without X button */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div 
                        className="flex items-center gap-2 flex-wrap mb-3"
                      >
                        {message.attachments.map((attachment, index) => (
                          <div 
                            key={index}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                              border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)'
                            }}
                          >
                            {attachment.type === 'image' ? (
                              <>
                                <ImageIcon size={14} style={{ color: 'var(--foreground)', opacity: 0.7, flexShrink: 0 }} />
                                <span 
                                  className="text-xs max-w-[120px] truncate"
                                  style={{ color: 'var(--foreground)' }}
                                >
                                  {attachment.file.name}
                                </span>
                              </>
                            ) : (
                              <>
                                <FileText size={14} style={{ color: 'var(--foreground)', opacity: 0.7, flexShrink: 0 }} />
                                <span 
                                  className="text-xs max-w-[120px] truncate"
                                  style={{ color: 'var(--foreground)' }}
                                >
                                  {attachment.file.name}
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 'var(--text-base)', color: 'var(--foreground)' }}>
                      {message.content}
                    </div>
                  </div>
                </div>
              ) : (
                // Assistant message
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent)' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1L10.5 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H5.5L8 1Z" fill="currentColor" style={{ color: 'var(--accent-foreground)' }} />
                    </svg>
                  </div>
                  <div className="flex-1 pt-1">
                    {/* Message content with Markdown support; show typing indicator when this is the streaming placeholder */}
                    {isStreamingPlaceholder ? (
                      <div className="flex items-center h-8">
                        <LoadingDots />
                      </div>
                    ) : (
                    <div className="markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Paragraphs
                          p: ({ children }) => (
                            <p style={{ 
                              fontSize: 'var(--text-base)', 
                              color: 'var(--foreground)', 
                              lineHeight: '1.7',
                              marginBottom: '1rem'
                            }}>
                              {children}
                            </p>
                          ),
                          // Headings
                          h1: ({ children }) => (
                            <h1 style={{ 
                              fontSize: 'var(--text-2xl)', 
                              fontWeight: '600',
                              color: 'var(--foreground)',
                              marginBottom: '1rem',
                              marginTop: '1.5rem'
                            }}>
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 style={{ 
                              fontSize: 'var(--text-xl)', 
                              fontWeight: '600',
                              color: 'var(--foreground)',
                              marginBottom: '0.75rem',
                              marginTop: '1.25rem'
                            }}>
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 style={{ 
                              fontSize: 'var(--text-lg)', 
                              fontWeight: '600',
                              color: 'var(--foreground)',
                              marginBottom: '0.5rem',
                              marginTop: '1rem'
                            }}>
                              {children}
                            </h3>
                          ),
                          // Bold and italic
                          strong: ({ children }) => (
                            <strong style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                              {children}
                            </strong>
                          ),
                          em: ({ children }) => (
                            <em style={{ fontStyle: 'italic', color: 'var(--foreground)' }}>
                              {children}
                            </em>
                          ),
                          // Lists
                          ul: ({ children }) => (
                            <ul style={{ 
                              listStyleType: 'disc',
                              paddingLeft: '1.5rem',
                              marginBottom: '1rem',
                              fontSize: 'var(--text-base)',
                              color: 'var(--foreground)',
                              lineHeight: '1.7'
                            }}>
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol style={{ 
                              listStyleType: 'decimal',
                              paddingLeft: '1.5rem',
                              marginBottom: '1rem',
                              fontSize: 'var(--text-base)',
                              color: 'var(--foreground)',
                              lineHeight: '1.7'
                            }}>
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li style={{ marginBottom: '0.25rem' }}>
                              {children}
                            </li>
                          ),
                          // Links
                          a: ({ href, children }) => (
                            <a 
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ 
                                color: 'var(--primary)',
                                textDecoration: 'underline',
                                cursor: 'pointer'
                              }}
                            >
                              {children}
                            </a>
                          ),
                          // Inline code
                          code: ({ children, className }) => {
                            // Check if it's a code block (has language class) or inline code
                            const isInline = !className;
                            if (isInline) {
                              return (
                                <code style={{ 
                                  backgroundColor: 'var(--muted)',
                                  padding: '0.125rem 0.375rem',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: 'var(--text-sm)',
                                  fontFamily: 'monospace',
                                  color: 'var(--foreground)'
                                }}>
                                  {children}
                                </code>
                              );
                            }
                            // For code blocks, just return the children (will be handled separately)
                            return <code>{children}</code>;
                          },
                          // Blockquotes
                          blockquote: ({ children }) => (
                            <blockquote style={{ 
                              borderLeft: '4px solid var(--border)',
                              paddingLeft: '1rem',
                              marginLeft: '0',
                              marginBottom: '1rem',
                              color: 'var(--muted-foreground)',
                              fontStyle: 'italic'
                            }}>
                              {children}
                            </blockquote>
                          ),
                          // Horizontal rule
                          hr: () => (
                            <hr style={{ 
                              border: 'none',
                              borderTop: '1px solid var(--border)',
                              margin: '1.5rem 0'
                            }} />
                          ),
                          // Tables
                          table: ({ children }) => (
                            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                              <table style={{ 
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: 'var(--text-sm)',
                                color: 'var(--foreground)'
                              }}>
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead style={{ backgroundColor: 'var(--muted)' }}>
                              {children}
                            </thead>
                          ),
                          tbody: ({ children }) => (
                            <tbody>{children}</tbody>
                          ),
                          tr: ({ children }) => (
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              {children}
                            </tr>
                          ),
                          th: ({ children }) => (
                            <th style={{ 
                              padding: '0.75rem',
                              textAlign: 'left',
                              fontWeight: '600',
                              borderRight: '1px solid var(--border)'
                            }}>
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td style={{ 
                              padding: '0.75rem',
                              borderRight: '1px solid var(--border)'
                            }}>
                              {children}
                            </td>
                          ),
                          // Pre (code block container)
                          pre: ({ children }) => (
                            <pre style={{ 
                              backgroundColor: 'var(--card)',
                              padding: '1rem',
                              borderRadius: 'var(--radius)',
                              overflow: 'auto',
                              marginBottom: '1rem',
                              border: '1px solid var(--border)'
                            }}>
                              {children}
                            </pre>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                    )}

                    {/* Code blocks */}
                    {message.codeBlocks && message.codeBlocks.map((block, blockIdx) => (
                      <div key={blockIdx} className="my-4 rounded-lg overflow-hidden" style={{ 
                        backgroundColor: 'var(--card)',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                      }}>
                        <div className="flex items-center justify-between px-4 py-2 border-b" style={{ 
                          backgroundColor: 'var(--muted)',
                          borderColor: 'var(--border)'
                        }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--foreground)', opacity: 0.7 }}>
                            {block.language}
                          </span>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => copyCode(block.code)}
                              className="p-1 rounded hover:bg-background/50 transition-colors"
                              title="Copy code"
                            >
                              <Copy size={14} style={{ color: 'var(--foreground)', opacity: 0.7 }} />
                            </button>
                            <button className="p-1 rounded hover:bg-background/50 transition-colors" title="Edit">
                              <Pencil size={14} style={{ color: 'var(--foreground)', opacity: 0.7 }} />
                            </button>
                            <button className="p-1 rounded hover:bg-background/50 transition-colors" title="Insert below">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
                                <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </button>
                            <button className="p-1 rounded hover:bg-background/50 transition-colors" title="Run">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
                                <path d="M4 2l8 5-8 5V2z" fill="currentColor"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="px-4 py-3" style={{ 
                          fontFamily: 'monospace',
                          fontSize: 'var(--text-sm)',
                          color: 'var(--foreground)'
                        }}>
                          {block.code}
                        </div>
                      </div>
                    ))}

                    {/* Additional text after code blocks */}
                    {message.codeBlocks && (
                      <div className="mt-4" style={{ fontSize: 'var(--text-base)', color: 'var(--foreground)', lineHeight: '1.7' }}>
                        <p className="mb-4">They'll give you 95% of the same visual feel.</p>
                        <p>If you'd like, I can extract and inspect the exact SVG paths from the uploaded screenshot and match them more precisely.</p>
                      </div>
                    )}

                    {/* Images */}
                    {message.images && message.images.map((image, imgIdx) => (
                      <div key={imgIdx} className="my-4 rounded-lg overflow-hidden" style={{ 
                        backgroundColor: 'var(--card)',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                      }}>
                        <img 
                          src={image.url} 
                          alt={image.alt || 'Generated image'} 
                          className="w-full h-auto"
                          style={{ display: 'block' }}
                        />
                        {image.caption && (
                          <div className="px-4 py-3 border-t" style={{ 
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                            fontSize: 'var(--text-sm)',
                            color: 'var(--muted-foreground)'
                          }}>
                            {image.caption}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Charts */}
                    {message.charts && message.charts.map((chart, chartIdx) => (
                      <div key={chartIdx} className="my-4 rounded-lg overflow-hidden p-4" style={{ 
                        backgroundColor: 'var(--card)',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                      }}>
                        {chart.title && (
                          <h4 style={{ 
                            fontSize: 'var(--text-base)',
                            fontWeight: '600',
                            color: 'var(--foreground)',
                            marginBottom: '1rem'
                          }}>
                            {chart.title}
                          </h4>
                        )}
                        <ResponsiveContainer width="100%" height={300}>
                          {chart.type === 'bar' ? (
                            <BarChart data={chart.data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                              <XAxis 
                                dataKey="name" 
                                stroke="var(--muted-foreground)"
                                style={{ fontSize: 'var(--text-xs)' }}
                              />
                              <YAxis 
                                stroke="var(--muted-foreground)"
                                style={{ fontSize: 'var(--text-xs)' }}
                              />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: 'var(--card)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: 'var(--text-sm)'
                                }}
                              />
                              <Legend 
                                wrapperStyle={{ 
                                  fontSize: 'var(--text-sm)',
                                  color: 'var(--foreground)'
                                }}
                              />
                              <Bar dataKey="usage" fill="var(--primary)" />
                            </BarChart>
                          ) : (
                            <LineChart data={chart.data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                              <XAxis 
                                dataKey="name" 
                                stroke="var(--muted-foreground)"
                                style={{ fontSize: 'var(--text-xs)' }}
                              />
                              <YAxis 
                                stroke="var(--muted-foreground)"
                                style={{ fontSize: 'var(--text-xs)' }}
                              />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: 'var(--card)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: 'var(--text-sm)'
                                }}
                              />
                              <Legend 
                                wrapperStyle={{ 
                                  fontSize: 'var(--text-sm)',
                                  color: 'var(--foreground)'
                                }}
                              />
                              <Line type="monotone" dataKey="usage" stroke="var(--primary)" />
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    ))}

                    {/* File Attachments */}
                    {message.files && message.files.length > 0 && (
                      <div className="my-4 space-y-2">
                        {message.files.map((file, fileIdx) => (
                          <div 
                            key={fileIdx} 
                            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/20 transition-colors cursor-pointer"
                            style={{ 
                              backgroundColor: 'var(--card)',
                              border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                            }}
                          >
                            <div 
                              className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: 'var(--muted)' }}
                            >
                              <FileText size={20} style={{ color: 'var(--foreground)' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div style={{ 
                                fontSize: 'var(--text-sm)',
                                fontWeight: '500',
                                color: 'var(--foreground)',
                                marginBottom: '0.125rem'
                              }}>
                                {file.name}
                              </div>
                              <div style={{ 
                                fontSize: 'var(--text-xs)',
                                color: 'var(--muted-foreground)'
                              }}>
                                {file.type} • {file.size}
                              </div>
                            </div>
                            <button 
                              className="flex-shrink-0 p-2 rounded hover:bg-muted/30 transition-colors"
                              title="Download"
                            >
                              <Download size={18} style={{ color: 'var(--foreground)' }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Audio Player */}
                    {message.audio && (
                      <div className="my-4 rounded-lg p-4" style={{ 
                        backgroundColor: 'var(--card)',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                      }}>
                        <div className="flex items-center gap-4">
                          <button 
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: 'var(--primary)' }}
                            title="Play audio"
                          >
                            <Play size={18} style={{ color: 'var(--primary-foreground)' }} fill="currentColor" />
                          </button>
                          <div className="flex-1">
                            <div style={{ 
                              fontSize: 'var(--text-sm)',
                              fontWeight: '500',
                              color: 'var(--foreground)',
                              marginBottom: '0.5rem'
                            }}>
                              {message.audio.title || 'Audio Response'}
                            </div>
                            <div className="relative h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--muted)' }}>
                              <div 
                                className="absolute top-0 left-0 h-full rounded-full"
                                style={{ 
                                  width: '0%',
                                  backgroundColor: 'var(--primary)'
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted-foreground)' }}>
                                0:00
                              </span>
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted-foreground)' }}>
                                2:34
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Message actions - only show for last assistant message */}
                    {msgIndex === messages.length - 1 && (
                      <div className="flex items-center gap-2 mt-4">
                        <button className="p-1.5 rounded hover:bg-muted/20 transition-colors" title="Regenerate">
                          <RotateCw size={16} style={{ color: 'var(--foreground)', opacity: 0.6 }} />
                        </button>
                        <button className="p-1.5 rounded hover:bg-muted/20 transition-colors" title="Good response">
                          <ThumbsUp size={16} style={{ color: 'var(--foreground)', opacity: 0.6 }} />
                        </button>
                        <button className="p-1.5 rounded hover:bg-muted/20 transition-colors" title="Bad response">
                          <ThumbsDown size={16} style={{ color: 'var(--foreground)', opacity: 0.6 }} />
                        </button>
                        <button className="p-1.5 rounded hover:bg-muted/20 transition-colors" title="More options">
                          <MoreHorizontal size={16} style={{ color: 'var(--foreground)', opacity: 0.6 }} />
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
            <div className="mb-8">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent)' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L10.5 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H5.5L8 1Z" fill="currentColor" style={{ color: 'var(--accent-foreground)' }} />
                  </svg>
                </div>
                <div className="flex-1 flex items-center h-8">
                  <LoadingDots />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area at bottom */}
      <div className="p-4">
        <div 
          className="max-w-3xl mx-auto relative"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div 
              className="absolute inset-0 z-10 rounded-full flex items-center justify-center pointer-events-none"
              style={{
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                border: `2px dashed ${isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'}`,
                backdropFilter: 'blur(4px)'
              }}
            >
              <div className="text-center">
                <Paperclip size={32} style={{ color: 'var(--foreground)', opacity: 0.6, margin: '0 auto' }} />
                <p style={{ 
                  fontSize: 'var(--text-sm)', 
                  color: 'var(--foreground)', 
                  marginTop: '0.5rem',
                  opacity: 0.8
                }}>
                  Drop files here
                </p>
              </div>
            </div>
          )}

          <div 
            className={`flex flex-col gap-3 px-4 py-3 ${attachedFiles.length > 0 || isMultiline ? 'rounded-3xl' : 'rounded-full'}`}
            style={{ 
              backgroundColor: 'var(--card)', 
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)'
            }}
          >
            {/* Attachment previews inside the input box */}
            {attachedFiles.length > 0 && (
              <div 
                className="flex items-center gap-2 overflow-x-auto pb-1"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: `${isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'} transparent`
                }}
              >
                {attachedFiles.map((attachment, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    {attachment.type === 'image' ? (
                      <>
                        <ImageIcon size={14} style={{ color: 'var(--foreground)', opacity: 0.7, flexShrink: 0 }} />
                        <span 
                          className="text-xs max-w-[120px] truncate"
                          style={{ color: 'var(--foreground)' }}
                        >
                          {attachment.file.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <FileText size={14} style={{ color: 'var(--foreground)', opacity: 0.7, flexShrink: 0 }} />
                        <span 
                          className="text-xs max-w-[120px] truncate"
                          style={{ color: 'var(--foreground)' }}
                        >
                          {attachment.file.name}
                        </span>
                      </>
                    )}
                    <button
                      onClick={() => dispatch(removeAttachment(index))}
                      className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity"
                      style={{
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
                      }}
                      title="Remove"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--foreground)' }} />
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
                <button 
                  className="flex-shrink-0 hover:opacity-70 transition-opacity" 
                  title="Add attachment"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--foreground)' }}>
                    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                
                {/* Waveform visualization */}
                <div className="flex-1 flex items-center justify-center gap-0.5 h-10 overflow-hidden">
                  {Array.from({ length: 60 }).map((_, i) => {
                    const height = audioLevels[i] || 5;
                    return (
                      <div 
                        key={i}
                        className="flex-shrink-0"
                        style={{
                          width: '2px',
                          height: `${Math.max(height, 5)}%`,
                          backgroundColor: 'var(--foreground)',
                          borderRadius: '1px',
                          transition: 'height 0.1s ease',
                          opacity: 0.7
                        }}
                      />
                    );
                  })}
                </div>

                {/* Cancel button */}
                <button 
                  className="flex-shrink-0 hover:opacity-70 transition-opacity"
                  onClick={handleCancelVoice}
                  title="Cancel"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--foreground)' }}>
                    <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>

                {/* Confirm button */}
                <button 
                  className="flex-shrink-0 hover:opacity-70 transition-opacity"
                  onClick={handleConfirmVoice}
                  title="Confirm"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--foreground)' }}>
                    <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
            <div className="relative">
              <button 
                ref={attachButtonRef}
                className="flex-shrink-0 hover:opacity-70 transition-opacity" 
                title="Add attachment"
                onClick={handleAttachMenuClick}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--foreground)' }}>
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              {showAttachMenu && (
                <div 
                  className="absolute bottom-full mb-2 left-0 rounded-lg" 
                  style={{ 
                    backgroundColor: 'var(--card)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    minWidth: '220px'
                  }}
                >
                  <div className="py-1">
                    <button 
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAttachMenu(false);
                        setTimeout(() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.click();
                          }
                        }, 100);
                      }}
                      style={{ fontSize: 'var(--text-sm)', color: 'var(--foreground)' }}
                    >
                      <Paperclip size={16} style={{ opacity: 0.7 }} />
                      <span>Add photos & files</span>
                      <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 'var(--text-xs)' }}>⌘U</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything"
              rows={1}
              className="flex-1 bg-transparent outline-none placeholder:opacity-50 resize-none overflow-y-auto"
              style={{ 
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-source-sans-pro)',
                color: 'var(--foreground)',
                lineHeight: '1.5',
                minHeight: '24px',
                maxHeight: '200px'
              }}
            />
            <div className="flex items-center gap-2">
              <button className="flex-shrink-0 hover:opacity-70 transition-opacity" title="Voice input" onClick={toggleVoiceListening}>
                <Mic size={20} style={{ color: 'var(--foreground)' }} />
              </button>
              {inputValue.trim() || attachedFiles.length > 0 ? (
                <button 
                  onClick={handleSend}
                  disabled={isLoading || isStreaming}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
                  title={isLoading || isStreaming ? 'Waiting for response…' : 'Send message'}
                >
                  <ArrowUp size={18} />
                </button>
              ) : (
                <button className="flex-shrink-0 w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity" title="Audio waveform">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--foreground)' }}>
                    <rect x="3" y="7" width="2" height="6" rx="1" fill="currentColor"/>
                    <rect x="7" y="4" width="2" height="12" rx="1" fill="currentColor"/>
                    <rect x="11" y="6" width="2" height="8" rx="1" fill="currentColor"/>
                    <rect x="15" y="5" width="2" height="10" rx="1" fill="currentColor"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
            )}
          </div>
          <div className="text-center mt-3" style={{ fontSize: 'var(--text-xs)', color: 'var(--muted-foreground)' }}>
            ChatGPT can make mistakes. Check important info. See <span className="underline cursor-pointer hover:opacity-80">Cookie Preferences</span>.
          </div>
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none">
          <button
            className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center transition-all hover:opacity-80"
            style={{ 
              backgroundColor: 'var(--foreground)',
              color: 'var(--background)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
            }}
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
