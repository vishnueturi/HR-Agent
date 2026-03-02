import { MessageSquarePlus, Search, MessageSquare, Plus, Sun, Moon, Trash2, MoreHorizontal, Share, Pencil, Archive } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleTheme } from '../store/themeSlice';
import { selectUserInitials } from '../store/userSlice';
import { createNewChat, switchChat, deleteChat, updateChatTitle, selectAllChats, selectCurrentChatId } from '../store/chatSlice';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector(state => state.theme.isDark);
  const user = useAppSelector(state => state.user.user);
  const userInitials = useAppSelector(selectUserInitials);
  const chats = useAppSelector(selectAllChats);
  const currentChatId = useAppSelector(selectCurrentChatId);
  
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [openMenuChatId, setOpenMenuChatId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleNewChat = () => {
    dispatch(createNewChat());
  };

  const handleChatClick = (chatId: string) => {
    if (editingChatId !== chatId) {
      dispatch(switchChat(chatId));
    }
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

  const gpts = [
    { icon: '🤖', label: 'AI Editor from Ruben Haasid', active: false },
    { icon: '📸', label: 'Screen Shot to Code', active: true },
    { icon: '🎨', label: 'Image Generator PRO', active: false },
    { icon: '⚡', label: 'GMIcurrency.ai – MJ Prompt...', active: false },
    { icon: '🔍', label: 'Explore GPTs', active: false },
  ];

  const projects = [
    { label: 'New project', hasPlus: false },
    { label: 'HRAgent', hasPlus: false },
    { label: 'HRMSUPGRADE', hasPlus: false },
    { label: 'Application development', hasPlus: false },
    { label: 'Product Team', hasPlus: false },
    { label: 'Market Research', hasPlus: false },
    { label: 'srl kanth', hasPlus: true },
  ];

  return (
    <aside 
      className="h-screen flex flex-col"
      style={{ 
        width: isOpen ? '260px' : '0px',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        backgroundColor: 'var(--sidebar)',
        boxShadow: '2px 0 8px rgba(0, 0, 0, 0.05)',
        borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)'
      }}
    >
      {/* Top section */}
      <div className="p-3 flex items-center gap-3">
        <button 
          onClick={onToggle}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted/10 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--sidebar-foreground)' }}>
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.9"/>
            <path d="M8 10h8M8 14h5" stroke={isDark ? '#1a1a1a' : 'white'} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="hover:opacity-70 transition-opacity" style={{ color: 'var(--sidebar-foreground)' }}>
          <span style={{ fontSize: 'var(--text-xl)', fontFamily: 'var(--font-source-sans-pro)', fontWeight: 'var(--font-weight-bold)' }}>HR Agent</span>
        </button>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 overflow-y-auto px-2">
        {/* New Chat Button */}
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors group"
        >
          <MessageSquarePlus 
            size={18} 
            style={{ color: 'var(--sidebar-foreground)', opacity: 0.8 }}
          />
          <span style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-source-sans-pro)', color: 'var(--sidebar-foreground)' }}>
            New chat
          </span>
        </button>

        {/* Search Button */}
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors group"
        >
          <Search 
            size={18} 
            style={{ color: 'var(--sidebar-foreground)', opacity: 0.8 }}
          />
          <span style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-source-sans-pro)', color: 'var(--sidebar-foreground)' }}>
            Search chats
          </span>
        </button>

        {/* Recent Chats Section */}
        <div className="mt-4">
          <div className="px-3 py-2">
            <span style={{ 
              fontSize: 'var(--text-xs)', 
              fontFamily: 'var(--font-source-sans-pro)',
              color: 'var(--sidebar-foreground)', 
              opacity: 0.6,
              fontWeight: 'var(--font-weight-semibold)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Recent Chats
            </span>
          </div>
          {chats.length > 0 && chats.map((chat) => (
            <div key={chat.id} className="relative">
              <button
                onClick={() => handleChatClick(chat.id)}
                onMouseEnter={() => setHoveredChatId(chat.id)}
                onMouseLeave={() => setHoveredChatId(null)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors group"
                style={{
                  backgroundColor: currentChatId === chat.id ? 'var(--muted)' : 'transparent'
                }}
              >
                <MessageSquare 
                  size={18} 
                  style={{ color: 'var(--sidebar-foreground)', opacity: 0.7 }} 
                />
                <span 
                  className="flex-1 text-left truncate" 
                  style={{ 
                    fontSize: 'var(--text-base)', 
                    fontFamily: 'var(--font-source-sans-pro)',
                    color: 'var(--sidebar-foreground)' 
                  }}
                >
                  {editingChatId === chat.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveRename(chat.id)}
                      onKeyDown={(e) => handleRenameKeyDown(e, chat.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-1 py-0.5 rounded"
                      style={{
                        backgroundColor: 'transparent',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.2)',
                        color: 'var(--sidebar-foreground)',
                        fontSize: 'var(--text-base)',
                        fontFamily: 'var(--font-source-sans-pro)',
                        outline: 'none'
                      }}
                    />
                  ) : (
                    chat.title
                  )}
                </span>
                <div
                  onClick={(e) => handleMenuClick(e, chat.id)}
                  className="p-1 rounded hover:bg-muted/20 transition-all cursor-pointer"
                  title="More options"
                  style={{
                    opacity: hoveredChatId === chat.id ? 1 : 0,
                    pointerEvents: hoveredChatId === chat.id ? 'auto' : 'none'
                  }}
                >
                  <MoreHorizontal size={16} style={{ color: 'var(--sidebar-foreground)' }} />
                </div>
              </button>
              
              {/* Dropdown Menu */}
              {openMenuChatId === chat.id && (
                <div
                  ref={menuRef}
                  className="absolute right-2 top-full mt-1 w-40 rounded-lg shadow-xl z-50"
                  style={{
                    backgroundColor: 'var(--card)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <div className="py-1">
                    <button
                      onClick={(e) => handleShareChat(e, chat.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors text-left"
                    >
                      <Share size={16} style={{ color: 'var(--foreground)' }} />
                      <span style={{ 
                        fontSize: 'var(--text-sm)', 
                        fontFamily: 'var(--font-source-sans-pro)', 
                        color: 'var(--foreground)' 
                      }}>
                        Share
                      </span>
                    </button>
                    <button
                      onClick={(e) => handleRenameChat(e, chat.id)}
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
                      onClick={(e) => handleArchiveChat(e, chat.id)}
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
                      onClick={(e) => handleDeleteChat(e, chat.id)}
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
          ))}
        </div>

        {/* GPTs Section */}
        <div className="mt-6">
          {gpts.map((gpt, index) => (
            null
          ))}
        </div>

        {/* Projects Section */}
        <div className="mt-6 mb-4">
          {projects.map((project, index) => (
            null
          ))}
        </div>
      </nav>

      {/* Bottom section with theme toggle and user profile */}
      <div className="p-3">
        {/* Theme toggle button */}
        <button 
          onClick={() => dispatch(toggleTheme())}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors mb-2"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun size={18} style={{ color: 'var(--sidebar-foreground)', opacity: 0.8 }} />
          ) : (
            <Moon size={18} style={{ color: 'var(--sidebar-foreground)', opacity: 0.8 }} />
          )}
          <span style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-source-sans-pro)', color: 'var(--sidebar-foreground)' }}>
            {isDark ? 'Light mode' : 'Dark mode'}
          </span>
        </button>

        {/* User profile */}
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-muted/10 transition-colors">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" 
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <span style={{ color: 'var(--primary-foreground)', fontSize: 'var(--text-base)', fontFamily: 'var(--font-source-sans-pro)', fontWeight: 'var(--font-weight-semibold)' }}>
              {userInitials}
            </span>
          </div>
          <div className="flex-1 text-left">
            <div style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-source-sans-pro)', color: 'var(--sidebar-foreground)' }}>
              {user.firstName} {user.lastName}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-source-sans-pro)', color: 'var(--sidebar-foreground)', opacity: 0.6 }}>
              {user.email}
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
}