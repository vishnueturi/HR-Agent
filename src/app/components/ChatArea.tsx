import { Pencil, Mic, ArrowUp, ArrowDown, RotateCw, ThumbsUp, ThumbsDown, Copy, Download, Play, Pause, FileText, Image as ImageIcon, Paperclip, MoreHorizontal } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectCurrentChat, selectAttachedFiles, addMessage, clearAttachments, addAttachment, removeAttachment } from '../store/chatSlice';
import { selectUserInitials } from '../store/userSlice';
import type { Message, CodeBlock, ChartData, FileAttachment, ImageData, AudioData } from '../store/chatSlice';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);

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

  const handleSend = () => {
    if (inputValue.trim() || attachedFiles.length > 0) {
      const newMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: inputValue,
        timestamp: new Date(),
        attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined
      };
      dispatch(addMessage(newMessage));
      setInputValue('');
      dispatch(clearAttachments());
      
      // Simulate assistant response
      setIsLoading(true);
      setTimeout(() => {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: 'This is a simulated response. In a real application, this would connect to an AI service.',
          timestamp: new Date()
        };
        dispatch(addMessage(assistantMessage));
        setIsLoading(false);
      }, 1000);
    }
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

  const handleAttachClick = () => {
    setShowAttachMenu(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
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
        dispatch(addAttachment(file, isImage ? 'image' : 'document', preview));
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
      dispatch(addAttachment(file, isImage ? 'image' : 'document', preview));
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
          
          {messages.map((message, msgIndex) => (
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
                    {/* Message content with Markdown support */}
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
          ))}
          {isLoading && (
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
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)' }}
                  title="Send message"
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