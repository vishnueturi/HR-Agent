import { Share2, MoreHorizontal, ChevronDown, Pencil, Archive, Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectCurrentChat, selectCurrentChatId, deleteChat, updateChatTitle } from '../store/chatSlice';

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function ChatHeader({ onToggleSidebar, sidebarOpen }: ChatHeaderProps) {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector(state => state.theme.isDark);
  const currentChat = useAppSelector(selectCurrentChat);
  const currentChatId = useAppSelector(selectCurrentChatId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <header className="px-4 py-3 flex items-center justify-between" style={{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}>
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <button 
            onClick={onToggleSidebar}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted/20 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="4" width="14" height="2" rx="1" fill="currentColor"/>
              <rect x="3" y="9" width="14" height="2" rx="1" fill="currentColor"/>
              <rect x="3" y="14" width="14" height="2" rx="1" fill="currentColor"/>
            </svg>
          </button>
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded">
          {isEditing && currentChat ? (
            <input
              ref={inputRef}
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={handleSaveRename}
              onKeyDown={handleRenameKeyDown}
              className="px-2 py-1 rounded"
              style={{
                backgroundColor: 'transparent',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.2)',
                color: 'var(--foreground)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-source-sans-pro)',
                outline: 'none',
                minWidth: '200px'
              }}
            />
          ) : (
            <>
              <span style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-source-sans-pro)' }}>
                {currentChat ? currentChat.title : 'Screen Shot to Code 5.2'}
              </span>
              
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded hover:bg-muted/20 transition-colors flex items-center gap-2">
          <Share2 size={16} />
          <span style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-source-sans-pro)' }}>Share</span>
        </button>
        <div className="relative">
          <button 
            onClick={handleMenuClick}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted/20 transition-colors"
          >
            <MoreHorizontal size={18} />
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl z-50"
              style={{
                backgroundColor: 'var(--card)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
              }}
            >
              <div className="py-1">
                <button
                  onClick={handleRename}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors text-left"
                >
                  <Pencil size={16} style={{ color: 'var(--foreground)' }} />
                  <span style={{ 
                    fontSize: 'var(--text-sm)', 
                    fontFamily: 'var(--font-source-sans-pro)', 
                    color: 'var(--foreground)' 
                  }}>
                    Rename
                  </span>
                </button>
                <button
                  onClick={handleArchive}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors text-left"
                >
                  <Archive size={16} style={{ color: 'var(--foreground)' }} />
                  <span style={{ 
                    fontSize: 'var(--text-sm)', 
                    fontFamily: 'var(--font-source-sans-pro)', 
                    color: 'var(--foreground)' 
                  }}>
                    Archive
                  </span>
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors text-left"
                >
                  <Trash2 size={16} style={{ color: 'var(--destructive)' }} />
                  <span style={{ 
                    fontSize: 'var(--text-sm)', 
                    fontFamily: 'var(--font-source-sans-pro)', 
                    color: 'var(--destructive)' 
                  }}>
                    Delete
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}