import { X, MessageSquare, SquarePen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Chat } from '../store/chatSlice';
import { cn } from './ui/utils';

export interface SearchChatsModalProps {
  open: boolean;
  onClose: () => void;
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function filterChatsByQuery(chats: Chat[], query: string): Chat[] {
  const q = query.trim().toLowerCase();
  if (!q) return chats;
  return chats.filter((c) => c.title.toLowerCase().includes(q));
}

type TimeBucket = 'today' | 'prev7' | 'prev30' | 'older';

function bucketForUpdatedAt(updatedAt: Date, startToday: Date): TimeBucket {
  const t = updatedAt.getTime();
  const sod = startToday.getTime();
  const sevenDaysAgo = sod - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = sod - 30 * 24 * 60 * 60 * 1000;
  if (t >= sod) return 'today';
  if (t >= sevenDaysAgo) return 'prev7';
  if (t >= thirtyDaysAgo) return 'prev30';
  return 'older';
}

function groupChatsByTime(chats: Chat[]): Record<TimeBucket, Chat[]> {
  const startToday = startOfLocalDay(new Date());
  const empty: Record<TimeBucket, Chat[]> = {
    today: [],
    prev7: [],
    prev30: [],
    older: [],
  };
  const sorted = [...chats].sort(
    (a, b) => toDate(b.updatedAt).getTime() - toDate(a.updatedAt).getTime()
  );
  for (const chat of sorted) {
    const bucket = bucketForUpdatedAt(toDate(chat.updatedAt), startToday);
    empty[bucket].push(chat);
  }
  return empty;
}

const SECTIONS: { key: TimeBucket; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'prev7', label: 'Previous 7 Days' },
  { key: 'prev30', label: 'Previous 30 Days' },
  { key: 'older', label: 'Older' },
];

export function SearchChatsModal({
  open,
  onClose,
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
}: SearchChatsModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const filtered = useMemo(() => filterChatsByQuery(chats, query), [chats, query]);
  const grouped = useMemo(() => groupChatsByTime(filtered), [filtered]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('ui-modal-open');
    return () => {
      document.body.classList.remove('ui-modal-open');
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handlePickChat = useCallback(
    (chatId: string) => {
      onSelectChat(chatId);
      onClose();
    },
    [onSelectChat, onClose]
  );

  const handleNewChat = useCallback(() => {
    onNewChat();
    onClose();
  }, [onNewChat, onClose]);

  const easeModal = [0.16, 1, 0.3, 1] as const;
  const backdropTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.22, ease: easeModal };
  const panelTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.28, ease: easeModal };

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 ui-modal-backdrop"
          onMouseDown={handleBackdrop}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={backdropTransition}
        >
          <motion.div
            className="ui-modal-panel flex w-full max-w-lg flex-col overflow-hidden rounded-xl"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Search chats"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 6 }}
            transition={panelTransition}
          >
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats..."
            className="ui-modal-search-input min-w-0 flex-1 bg-transparent py-2 pl-1 pr-2 outline-none rounded-md border border-transparent focus:border-border/60 transition-colors"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-[background-color,transform] duration-200 ease-out hover:bg-muted/50 active:scale-[0.97]"
            aria-label="Close"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="ui-themed-scroll min-h-0 flex-1 overflow-y-auto px-1 py-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color] duration-200 ease-out hover:bg-muted/40"
          >
            <SquarePen size={18} className="text-foreground opacity-85" />
            <span className="text-app-base text-foreground">
              New chat
            </span>
          </button>

          {SECTIONS.map(({ key, label }) => {
            const list = grouped[key];
            if (list.length === 0) return null;
            return (
              <div key={key} className="mt-1">
                <div className="px-3 pb-1 pt-2 text-app-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {label}
                </div>
                {list.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => handlePickChat(chat.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color] duration-150 ease-out hover:bg-muted/40 border border-transparent',
                      currentChatId === chat.id && 'ui-chat-row-active shadow-sm'
                    )}
                  >
                    <MessageSquare
                      size={18}
                      className="text-foreground/75 shrink-0"
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-app-base text-foreground"
                    >
                      {chat.title}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-app-sm text-muted-foreground">
              {query.trim() ? 'No chats found.' : 'No chats yet.'}
            </div>
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
