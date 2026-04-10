import { MoreHorizontal, Pencil, Archive, Trash2, ExternalLink, Sun, Moon, PanelLeft } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectCurrentChat, selectCurrentChatId, deleteChat, updateChatTitle } from '../store/chatSlice';
import { toggleTheme } from '../store/themeSlice';
import { getHrmsAccessToken } from '../backend/config';

/** True when HR Agent runs inside the HR portal widget iframe (not standalone). */
function isEmbeddedInHrPortal(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

export interface ChatHeaderProps {
  /** Shown on small viewports to open the sidebar overlay. */
  onOpenSidebar?: () => void;
  showSidebarTrigger?: boolean;
}

export function ChatHeader({ onOpenSidebar, showSidebarTrigger }: ChatHeaderProps = {}) {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector(state => state.theme.isDark);
  const currentChat = useAppSelector(selectCurrentChat);
  const currentChatId = useAppSelector(selectCurrentChatId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isMenuOpen]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(!isMenuOpen);
  };

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentChat) {
      setIsEditing(true);
      setEditingTitle(currentChat.title);
      setIsMenuOpen(false);
    }
  };

  const handleSaveRename = () => {
    if (currentChat && editingTitle.trim()) {
      dispatch(updateChatTitle({ chatId: currentChat.id, title: editingTitle.trim() }));
    }
    setIsEditing(false);
    setEditingTitle('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditingTitle('');
    }
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Archive chat:', currentChatId);
    setIsMenuOpen(false);
    // TODO: Implement archive functionality
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentChatId) {
      dispatch(deleteChat(currentChatId));
    }
    setIsMenuOpen(false);
  };

  const handleOpenFullPageInNewTab = () => {
    const url = new URL(window.location.href);
    const token = getHrmsAccessToken();

    if (token?.trim()) {
      const tokenOnly = token.trim().replace(/^Bearer\s+/i, '');
      url.searchParams.set('access_token', tokenOnly);
      url.searchParams.delete('handoff');
    }

    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const menuEase = [0.16, 1, 0.3, 1] as const;
  const menuTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.18, ease: menuEase };

  return (
    <header className="flex-shrink-0 px-2 sm:px-3 py-2.5 flex items-center justify-between gap-2 border-b border-border/40 text-foreground transition-[border-color] duration-300 ease-out">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        {showSidebarTrigger && onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-border/50 bg-card/50 hover:bg-muted/30 transition-[background-color,transform] duration-200 ease-out active:scale-[0.97] shadow-sm"
            title="Open sidebar"
            aria-label="Open sidebar"
          >
            <PanelLeft size={18} className="text-foreground" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 sm:px-3 py-1.5">
          {isEditing && currentChat ? (
            <input
              ref={inputRef}
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={handleSaveRename}
              onKeyDown={handleRenameKeyDown}
              className="ui-input-edit min-w-0 flex-1 px-2 py-1 w-full max-w-full sm:max-w-md"
            />
          ) : (
            <>
              <span
                className="min-w-0 flex-1 truncate text-app-base"
                title={currentChat?.title ?? 'OnBlick Agent'}
              >
                {currentChat ? currentChat.title : 'OnBlick Agent'}
              </span>
            </>
          )}
        </div>
      </div>
      {isEmbeddedInHrPortal() && (
        <button
          type="button"
          onClick={handleOpenFullPageInNewTab}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/30 transition-[background-color,transform] duration-200 ease-out active:scale-[0.97]"
          title="Open HR Agent in a new tab (full page)"
          aria-label="Open HR Agent in a new tab"
        >
          <ExternalLink size={18} className="text-foreground" />
        </button>
      )}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => dispatch(toggleTheme())}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/25 transition-[background-color,transform] duration-200 ease-out active:scale-[0.97]"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun size={18} className="text-foreground opacity-90" />
          ) : (
            <Moon size={18} className="text-foreground opacity-90" />
          )}
        </button>
        {/*
        Share (header) — disabled for now; uncomment when implementing share.
        Re-add Share2 to the lucide-react import above.
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg hover:bg-muted/20 transition-[background-color,opacity] duration-200 ease-out flex items-center gap-2 active:scale-[0.99]"
        >
          <Share2 size={16} />
          <span className="text-app-base">Share</span>
        </button>
        */}
        <div className="relative">
          <button
            type="button"
            onClick={handleMenuClick}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/20 transition-[background-color,transform] duration-200 ease-out active:scale-[0.97]"
          >
            <MoreHorizontal size={18} />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                ref={menuRef}
                className="ui-popover-panel absolute right-0 top-full mt-1 w-40 rounded-lg z-50 origin-top-right"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: -2 }}
                transition={menuTransition}
              >
              <div className="py-1">
                <button
                  type="button"
                  onClick={handleRename}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors duration-150 text-left"
                >
                  <Pencil size={16} className="text-foreground" />
                  <span className="text-app-sm text-foreground">
                    Rename
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleArchive}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors duration-150 text-left"
                >
                  <Archive size={16} className="text-foreground" />
                  <span className="text-app-sm text-foreground">
                    Archive
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors duration-150 text-left"
                >
                  <Trash2 size={16} className="text-destructive" />
                  <span className="text-app-sm text-destructive">
                    Delete
                  </span>
                </button>
              </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
