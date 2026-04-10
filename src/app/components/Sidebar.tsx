import { MessageSquarePlus, MessageSquare, Trash2, MoreHorizontal, Share, Pencil, Archive, PanelLeft } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectUserInitials } from '../store/userSlice';
import {
  createNewChat,
  switchChat,
  deleteChat,
  updateChatTitle,
  selectAllChats,
  selectCurrentChatId,
  upsertChatsFromHistory,
  replaceChatMessages,
} from '../store/chatSlice';
import { store } from '../store';
import { getHrmsAccessToken } from '../backend/config';
import {
  type ConversationHistoryRow,
  buildChatsFromHistoryRows,
  conversationFeedHasMoreAfterPage,
  fetchConversationHistoryPage,
  fetchConversationThread,
  fetchConversationByConversationPage,
  getDefaultConversationListPageSize,
  getDefaultThreadPageSize,
  mergeConversationHistoryRows,
  paginationStateAfterPage,
  rowsToMessages,
  titleFromHistoryRows,
} from '../backend/conversationHistoryApi';
import { cn } from './ui/utils';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  /** Narrow viewport: sidebar is a sliding overlay. */
  isMobile?: boolean;
  /** Called after navigation so the overlay can close. */
  onRequestClose?: () => void;
}

export function Sidebar({ isOpen, onToggle, isMobile = false, onRequestClose }: SidebarProps) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.user.user);
  const userInitials = useAppSelector(selectUserInitials);
  const chats = useAppSelector(selectAllChats);
  const currentChatId = useAppSelector(selectCurrentChatId);
  
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [openMenuChatId, setOpenMenuChatId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [profileImageError, setProfileImageError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<ConversationHistoryRow[]>([]);
  const recentChatsScrollRef = useRef<HTMLDivElement>(null);
  const feedNextPageRef = useRef(2);
  const loadingMoreRef = useRef(false);
  const feedHasMoreRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    feedHasMoreRef.current = feedHasMore;
  }, [feedHasMore]);

  useEffect(() => {
    setProfileImageError(false);
  }, [user.profilePicUrl]);

  /** Load full thread from server (by-conversation or fallback) — used on chat click and initial load. */
  const loadThreadIntoChat = useCallback(
    async (chatId: string, conversationId: string) => {
      const pageSize = getDefaultThreadPageSize();
      try {
        const page = await fetchConversationByConversationPage(conversationId, 0, pageSize);
        if (page) {
          dispatch(
            replaceChatMessages({
              chatId,
              messages: rowsToMessages(page.rows),
              title: titleFromHistoryRows(page.rows),
              historyPagination: paginationStateAfterPage(page, false),
            })
          );
          return;
        }
        const rows = await fetchConversationThread(conversationId);
        if (rows.length === 0) return;
        dispatch(
          replaceChatMessages({
            chatId,
            messages: rowsToMessages(rows),
            title: titleFromHistoryRows(rows),
            historyPagination: null,
          })
        );
      } catch {
        // Keep messages already shown from the list response.
      }
    },
    [dispatch]
  );

  const loadThreadIntoChatRef = useRef(loadThreadIntoChat);
  loadThreadIntoChatRef.current = loadThreadIntoChat;

  const loadMoreConversationFeed = useCallback(async () => {
    if (!feedHasMoreRef.current || loadingMoreRef.current) return;
    const pageNo = feedNextPageRef.current;
    loadingMoreRef.current = true;
    setHistoryLoadingMore(true);
    try {
      const listPageSize = getDefaultConversationListPageSize();
      const page = await fetchConversationHistoryPage(pageNo, listPageSize);
      rowsRef.current = mergeConversationHistoryRows(rowsRef.current, page.data ?? []);
      const hasMore = conversationFeedHasMoreAfterPage(page, rowsRef.current.length);
      setFeedHasMore(hasMore);
      feedNextPageRef.current = pageNo + 1;
      const mergedChats = buildChatsFromHistoryRows(rowsRef.current);
      dispatch(upsertChatsFromHistory(mergedChats));
    } catch {
      // Leave list as-is on failure.
    } finally {
      loadingMoreRef.current = false;
      setHistoryLoadingMore(false);
    }
  }, [dispatch]);

  const onRecentChatsScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const thresholdPx = 100;
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
      if (!nearBottom) return;
      if (!feedHasMoreRef.current || loadingMoreRef.current) return;
      void loadMoreConversationFeed();
    },
    [loadMoreConversationFeed]
  );

  useEffect(() => {
    if (!getHrmsAccessToken()) return;

    let cancelled = false;
    setHistoryLoading(true);
    rowsRef.current = [];
    feedNextPageRef.current = 2;
    setFeedHasMore(false);

    void (async () => {
      try {
        const listPageSize = getDefaultConversationListPageSize();
        const page = await fetchConversationHistoryPage(1, listPageSize);
        if (cancelled) return;
        rowsRef.current = mergeConversationHistoryRows(rowsRef.current, page.data ?? []);
        const hasMore = conversationFeedHasMoreAfterPage(page, rowsRef.current.length);
        setFeedHasMore(hasMore);

        const chats = buildChatsFromHistoryRows(rowsRef.current);
        if (!chats.length) return;

        dispatch(upsertChatsFromHistory(chats));
        const latest = chats[0];
        dispatch(switchChat(latest.id));

        const convId = latest.backendConversationId ?? latest.id;
        await loadThreadIntoChatRef.current(latest.id, convId);
      } catch {
        // Keep sidebar empty if history is unavailable or unauthorized.
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  /** If the list is shorter than the viewport, scroll never fires — auto-fetch until scrollable or exhausted. */
  useEffect(() => {
    if (!feedHasMore || historyLoadingMore || loadingMoreRef.current || historyLoading) return;
    const el = recentChatsScrollRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 2) return;
    void loadMoreConversationFeed();
  }, [
    chats.length,
    feedHasMore,
    historyLoadingMore,
    historyLoading,
    loadMoreConversationFeed,
  ]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuChatId(null);
      }
    }
    
    if (openMenuChatId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openMenuChatId]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingChatId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingChatId]);

  const maybeCloseMobile = useCallback(() => {
    if (isMobile) onRequestClose?.();
  }, [isMobile, onRequestClose]);

  const handleNewChat = () => {
    dispatch(createNewChat());
    maybeCloseMobile();
  };

  const handleChatClick = (chatId: string) => {
    if (editingChatId === chatId) return;
    dispatch(switchChat(chatId));

    const chat = store.getState().chat.chats.find((c) => c.id === chatId);
    if (!chat?.backendConversationId) return;

    void loadThreadIntoChat(chatId, chat.backendConversationId);
    maybeCloseMobile();
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    dispatch(deleteChat(chatId));
    setOpenMenuChatId(null);
  };

  const handleMenuClick = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setOpenMenuChatId(openMenuChatId === chatId ? null : chatId);
  };

  const handleShareChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    console.log('Share chat:', chatId);
    setOpenMenuChatId(null);
    // TODO: Implement share functionality
  };

  const handleRenameChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setEditingChatId(chatId);
      setEditingTitle(chat.title);
      setOpenMenuChatId(null);
    }
  };

  const handleSaveRename = (chatId: string) => {
    if (editingTitle.trim()) {
      dispatch(updateChatTitle({ chatId, title: editingTitle.trim() }));
    }
    setEditingChatId(null);
    setEditingTitle('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, chatId: string) => {
    if (e.key === 'Enter') {
      handleSaveRename(chatId);
    } else if (e.key === 'Escape') {
      setEditingChatId(null);
      setEditingTitle('');
    }
  };

  const handleArchiveChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    console.log('Archive chat:', chatId);
    setOpenMenuChatId(null);
    // TODO: Implement archive functionality
  };

  const menuEase = [0.16, 1, 0.3, 1] as const;
  const sidebarMenuTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.18, ease: menuEase };

  return (
    <aside
      className={cn(
        'h-screen flex-shrink-0 overflow-hidden border-r border-sidebar-border/60',
        isMobile
          ? cn(
              'fixed inset-y-0 left-0 z-40 w-[min(260px,85vw)] max-w-[100vw] bg-sidebar transition-transform duration-300 ease-out motion-safe:transition-transform',
              isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
            )
          : cn(
              'relative transition-[width,min-width,background-color] duration-200 ease-out',
              isOpen ? 'w-[260px] min-w-[260px] bg-sidebar' : 'w-[52px] min-w-[52px] bg-sidebar-rail'
            )
      )}
    >
      <div className="relative h-full w-full">
        <div
          className={cn(
            'absolute inset-0 flex flex-col overflow-hidden transition-opacity duration-200 ease-out',
            isOpen ? 'z-[1] opacity-100' : 'z-0 opacity-0 pointer-events-none'
          )}
          aria-hidden={!isOpen}
        >
      {/* Top: brand + collapse (ChatGPT-style) */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-2 pb-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <div className="ui-sidebar-brand-orb flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-sidebar-foreground">
              <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.95"/>
              <path d="M8 10h8M8 14h5" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="truncate text-app-base font-semibold text-sidebar-foreground tracking-tight">
            HR Agent
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="ui-nav-row flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground active:scale-[0.97]"
          title="Close sidebar"
          aria-label="Close sidebar"
        >
          <PanelLeft size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Main column: actions + scrollable recent chats */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2">
        {/* New Chat Button */}
        <button
          onClick={handleNewChat}
          className="ui-nav-row group flex w-full shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sidebar-foreground"
          type="button"
        >
          <MessageSquarePlus
            size={18}
            className="opacity-80"
            strokeWidth={1.75}
          />
          <span className="text-app-base">New chat</span>
        </button>

        {/* Recent Chats: scroll loads older feed pages (GET /Conversation) */}
        <div className="mt-1 flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-3">
            <span className="text-app-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
              Recent
            </span>
            {(historyLoading || historyLoadingMore) && (
              <span className="text-app-xs text-sidebar-foreground/50">…</span>
            )}
          </div>
          <div
            ref={recentChatsScrollRef}
            className="ui-themed-scroll min-h-0 flex-1 overflow-y-auto pr-0.5"
            onScroll={onRecentChatsScroll}
          >
          {chats.length > 0 && chats.map((chat) => (
            <div key={chat.id} className="relative">
              <button
                type="button"
                onClick={() => handleChatClick(chat.id)}
                onMouseEnter={() => setHoveredChatId(chat.id)}
                onMouseLeave={() => setHoveredChatId(null)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors duration-200 ease-out',
                  currentChatId === chat.id ? 'bg-[var(--surface-active)]' : 'hover:bg-[var(--surface-hover)]'
                )}
              >
                <MessageSquare
                  size={18}
                  strokeWidth={1.75}
                  className="shrink-0 text-sidebar-foreground/55"
                />
                <span className="flex-1 text-left truncate text-app-base text-sidebar-foreground">
                  {editingChatId === chat.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveRename(chat.id)}
                      onKeyDown={(e) => handleRenameKeyDown(e, chat.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="ui-sidebar-input w-full px-1 py-0.5"
                    />
                  ) : (
                    chat.title
                  )}
                </span>
                <div
                  onClick={(e) => handleMenuClick(e, chat.id)}
                  className={cn(
                    'cursor-pointer rounded-md p-1 transition-[opacity,background-color] duration-200 ease-out hover:bg-[var(--surface-hover)]',
                    hoveredChatId === chat.id || openMenuChatId === chat.id
                      ? 'opacity-100 pointer-events-auto'
                      : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                  )}
                  title="More options"
                  role="presentation"
                >
                  <MoreHorizontal size={16} strokeWidth={1.75} className="text-sidebar-foreground opacity-80" />
                </div>
              </button>
              
              {/* Dropdown Menu */}
              <AnimatePresence>
                {openMenuChatId === chat.id && (
                  <motion.div
                    ref={menuRef}
                    className="ui-popover-panel absolute right-2 top-full mt-1 w-40 rounded-lg z-50 origin-top-right"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: -2 }}
                    transition={sidebarMenuTransition}
                  >
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={(e) => handleShareChat(e, chat.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors duration-150 text-left"
                    >
                      <Share size={16} className="text-foreground" />
                      <span className="text-app-sm text-foreground">Share</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRenameChat(e, chat.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors duration-150 text-left"
                    >
                      <Pencil size={16} className="text-foreground" />
                      <span className="text-app-sm text-foreground">Rename</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleArchiveChat(e, chat.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors duration-150 text-left"
                    >
                      <Archive size={16} className="text-foreground" />
                      <span className="text-app-sm text-foreground">Archive</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors duration-150 text-left"
                    >
                      <Trash2 size={16} className="text-destructive" />
                      <span className="text-app-sm text-destructive">Delete</span>
                    </button>
                  </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          </div>
        </div>
      </div>

      {/* Bottom: user profile (ChatGPT-style) */}
      <div className="shrink-0 border-t border-sidebar-border/80 px-2 py-2">
        <button
          type="button"
          className="ui-nav-row flex w-full items-center gap-3 rounded-md px-2 py-2 text-sidebar-foreground"
        >
          {user.profilePicUrl && !profileImageError ? (
            <img
              src={user.profilePicUrl}
              alt=""
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              onError={() => setProfileImageError(true)}
            />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-primary text-primary-foreground shadow-sm border border-primary/20">
              <span className="text-app-base font-semibold">{userInitials}</span>
            </div>
          )}
          <div className="flex-1 text-left min-w-0">
            <div className="text-app-base text-sidebar-foreground truncate">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-app-xs text-sidebar-foreground/50 truncate">{user.email}</div>
          </div>
        </button>
      </div>
        </div>

        {/* Minimized: icon-only rail (ChatGPT-style) */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-stretch overflow-hidden transition-opacity duration-200 ease-out',
            isOpen ? 'z-0 opacity-0 pointer-events-none' : 'z-[1] opacity-100'
          )}
          aria-hidden={isOpen}
        >
          <div className="flex min-h-0 flex-1 flex-col items-center px-1.5 pt-2">
            <button
              type="button"
              onClick={onToggle}
              className="ui-nav-row flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground"
              title="Open sidebar"
              aria-label="Open sidebar"
            >
              <div className="ui-sidebar-brand-orb flex h-8 w-8 items-center justify-center rounded-full" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-sidebar-foreground">
                  <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.95" />
                  <path d="M8 10h8M8 14h5" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            </button>

            <div className="mt-2 flex w-full flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={handleNewChat}
                className="ui-nav-row flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground"
                title="New chat"
                aria-label="New chat"
              >
                <MessageSquarePlus size={20} strokeWidth={1.75} className="opacity-90" />
              </button>
            </div>

            <div className="min-h-0 flex-1" aria-hidden />

            <div className="w-full shrink-0 border-t border-sidebar-border/80 px-1.5 py-2">
              <button
                type="button"
                className="ui-nav-row mx-auto flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground"
                title={`${user.firstName} ${user.lastName}`}
              >
                {user.profilePicUrl && !profileImageError ? (
                  <img
                    src={user.profilePicUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                    onError={() => setProfileImageError(true)}
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm border border-primary/20">
                    <span className="text-app-sm font-semibold">{userInitials}</span>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}