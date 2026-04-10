import { createContext, useContext, useReducer, ReactNode } from 'react';

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  codeBlocks?: CodeBlock[];
  images?: ImageData[];
  charts?: ChartData[];
  files?: FileAttachment[];
  audio?: AudioData;
  attachments?: Array<{
    file: File;
    preview?: string;
    type: 'image' | 'document';
  }>;
}

export interface CodeBlock {
  language: string;
  code: string;
}

export interface ChartData {
  type: 'bar' | 'line';
  data: any[];
  title?: string;
}

export interface FileAttachment {
  name: string;
  type: string;
  size: string;
  url?: string;
}

export interface ImageData {
  url: string;
  alt?: string;
  caption?: string;
}

export interface AudioData {
  url: string;
  title?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface ChatState {
  chats: Chat[];
  currentChatId: string | null;
  attachedFiles: Array<{
    file: File;
    type: 'image' | 'document';
    preview?: string;
  }>;
}

type ChatAction =
  | { type: 'CREATE_CHAT' }
  | { type: 'CREATE_CHAT_WITH_MESSAGE'; payload: Message }
  | { type: 'ADD_MESSAGE_AUTO'; payload: Message }
  | { type: 'SWITCH_CHAT'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: { chatId: string; message: Message } }
  | { type: 'UPDATE_CHAT_TITLE'; payload: { chatId: string; title: string } }
  | { type: 'DELETE_CHAT'; payload: string }
  | { type: 'ADD_ATTACHMENT'; payload: { file: File; type: 'image' | 'document'; preview?: string } }
  | { type: 'REMOVE_ATTACHMENT'; payload: number }
  | { type: 'CLEAR_ATTACHMENTS' };

interface ChatContextType {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  createNewChat: () => void;
  switchChat: (chatId: string) => void;
  addMessage: (message: Message) => void;
  updateChatTitle: (chatId: string, title: string) => void;
  deleteChat: (chatId: string) => void;
  addAttachment: (file: File, type: 'image' | 'document', preview?: string) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  getCurrentChat: () => Chat | null;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Helper function to generate chat title from first message
function generateChatTitle(message: string): string {
  const words = message.trim().split(/\s+/);
  const title = words.slice(0, 6).join(' ');
  return title.length < message.length ? title + '...' : title;
}

const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
  switch (action.type) {
    case 'CREATE_CHAT': {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: 'New chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return {
        ...state,
        chats: [newChat, ...state.chats],
        currentChatId: newChat.id,
      };
    }

    case 'CREATE_CHAT_WITH_MESSAGE': {
      const message = action.payload;
      // Auto-generate title from first user message
      const title = message.type === 'user' ? generateChatTitle(message.content) : 'New chat';
      const newChat: Chat = {
        id: Date.now().toString(),
        title: title,
        messages: [message],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return {
        ...state,
        chats: [newChat, ...state.chats],
        currentChatId: newChat.id,
      };
    }

    case 'ADD_MESSAGE_AUTO': {
      const message = action.payload;
      // If no current chat exists, create one with the message
      if (!state.currentChatId) {
        const title = message.type === 'user' ? generateChatTitle(message.content) : 'New chat';
        const newChat: Chat = {
          id: Date.now().toString(),
          title: title,
          messages: [message],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return {
          ...state,
          chats: [newChat, ...state.chats],
          currentChatId: newChat.id,
        };
      } else {
        // Add message to current chat
        const updatedChats = state.chats.map(chat => {
          if (chat.id === state.currentChatId) {
            const updatedMessages = [...chat.messages, message];
            // Auto-generate title from first user message
            let newTitle = chat.title;
            if (chat.title === 'New chat' && message.type === 'user' && updatedMessages.length === 1) {
              newTitle = generateChatTitle(message.content);
            }
            return {
              ...chat,
              title: newTitle,
              messages: updatedMessages,
              updatedAt: new Date(),
            };
          }
          return chat;
        });
        return {
          ...state,
          chats: updatedChats,
        };
      }
    }

    case 'SWITCH_CHAT':
      return {
        ...state,
        currentChatId: action.payload,
        attachedFiles: [],
      };

    case 'ADD_MESSAGE': {
      const { chatId, message } = action.payload;
      const updatedChats = state.chats.map(chat => {
        if (chat.id === chatId) {
          const updatedMessages = [...chat.messages, message];
          // Auto-generate title from first user message
          let newTitle = chat.title;
          if (chat.title === 'New chat' && message.type === 'user' && updatedMessages.length === 1) {
            newTitle = generateChatTitle(message.content);
          }
          return {
            ...chat,
            title: newTitle,
            messages: updatedMessages,
            updatedAt: new Date(),
          };
        }
        return chat;
      });
      return {
        ...state,
        chats: updatedChats,
      };
    }

    case 'UPDATE_CHAT_TITLE': {
      const { chatId, title } = action.payload;
      const updatedChats = state.chats.map(chat =>
        chat.id === chatId ? { ...chat, title, updatedAt: new Date() } : chat
      );
      return {
        ...state,
        chats: updatedChats,
      };
    }

    case 'DELETE_CHAT': {
      const filteredChats = state.chats.filter(chat => chat.id !== action.payload);
      let newCurrentChatId = state.currentChatId;
      
      // If we deleted the current chat, switch to the first available chat
      if (state.currentChatId === action.payload) {
        newCurrentChatId = filteredChats.length > 0 ? filteredChats[0].id : null;
      }
      
      return {
        ...state,
        chats: filteredChats,
        currentChatId: newCurrentChatId,
      };
    }

    case 'ADD_ATTACHMENT':
      return {
        ...state,
        attachedFiles: [...state.attachedFiles, action.payload],
      };

    case 'REMOVE_ATTACHMENT':
      return {
        ...state,
        attachedFiles: state.attachedFiles.filter((_, i) => i !== action.payload),
      };

    case 'CLEAR_ATTACHMENTS':
      return {
        ...state,
        attachedFiles: [],
      };

    default:
      return state;
  }
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, {
    chats: [],
    currentChatId: null,
    attachedFiles: [],
  });

  const createNewChat = () => {
    dispatch({ type: 'CREATE_CHAT' });
  };

  const switchChat = (chatId: string) => {
    dispatch({ type: 'SWITCH_CHAT', payload: chatId });
  };

  const addMessage = (message: Message) => {
    // Use ADD_MESSAGE_AUTO which checks current state in the reducer
    dispatch({ type: 'ADD_MESSAGE_AUTO', payload: message });
  };

  const updateChatTitle = (chatId: string, title: string) => {
    dispatch({ type: 'UPDATE_CHAT_TITLE', payload: { chatId, title } });
  };

  const deleteChat = (chatId: string) => {
    dispatch({ type: 'DELETE_CHAT', payload: chatId });
  };

  const addAttachment = (file: File, type: 'image' | 'document', preview?: string) => {
    dispatch({ type: 'ADD_ATTACHMENT', payload: { file, type, preview } });
  };

  const removeAttachment = (index: number) => {
    dispatch({ type: 'REMOVE_ATTACHMENT', payload: index });
  };

  const clearAttachments = () => {
    dispatch({ type: 'CLEAR_ATTACHMENTS' });
  };

  const getCurrentChat = (): Chat | null => {
    if (!state.currentChatId) return null;
    return state.chats.find(chat => chat.id === state.currentChatId) || null;
  };

  return (
    <ChatContext.Provider
      value={{
        state,
        dispatch,
        createNewChat,
        switchChat,
        addMessage,
        updateChatTitle,
        deleteChat,
        addAttachment,
        removeAttachment,
        clearAttachments,
        getCurrentChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}