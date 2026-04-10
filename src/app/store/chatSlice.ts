import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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

/** Paged GET /Conversation/by-conversation: load latest page first, older pages on scroll-up. */
export interface ChatHistoryPagination {
  pageSize: number;
  /** Next `pageNo` to request for older messages; null when all pages are loaded. */
  nextPageNo: number | null;
  totalCount: number;
  loadingOlder: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  backendConversationId?: string;
  backendSessionId?: string;
  backendStage?: string;
  historyPagination?: ChatHistoryPagination;
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

// Helper function to generate chat title from first message
function generateChatTitle(message: string): string {
  const words = message.trim().split(/\s+/);
  const title = words.slice(0, 6).join(' ');
  return title.length < message.length ? title + '...' : title;
}

const initialState: ChatState = {
  chats: [],
  currentChatId: null,
  attachedFiles: [],
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    createNewChat: (state) => {
      const existingEmpty = state.chats.find(
        (c) => c.messages.length === 0 && c.title === 'New chat'
      );
      if (existingEmpty) {
        state.chats = state.chats.filter((c) => {
          if (c.messages.length === 0 && c.title === 'New chat') {
            return c.id === existingEmpty.id;
          }
          return true;
        });
        state.currentChatId = existingEmpty.id;
        return;
      }

      const newChat: Chat = {
        id: Date.now().toString(),
        title: 'New chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        backendConversationId: undefined,
        backendSessionId: undefined,
        backendStage: undefined,
      };
      state.chats.unshift(newChat);
      state.currentChatId = newChat.id;
    },
    
    switchChat: (state, action: PayloadAction<string>) => {
      state.currentChatId = action.payload;
      state.attachedFiles = [];
    },
    
    addMessage: (state, action: PayloadAction<Message>) => {
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
          backendConversationId: undefined,
          backendSessionId: undefined,
          backendStage: undefined,
        };
        state.chats.unshift(newChat);
        state.currentChatId = newChat.id;
      } else {
        // Add message to current chat
        const chat = state.chats.find(c => c.id === state.currentChatId);
        if (chat) {
          chat.messages.push(message);
          // Auto-generate title from first user message
          if (chat.title === 'New chat' && message.type === 'user' && chat.messages.length === 1) {
            chat.title = generateChatTitle(message.content);
          }
          chat.updatedAt = new Date();
        }
      }
    },
    
    updateChatTitle: (state, action: PayloadAction<{ chatId: string; title: string }>) => {
      const { chatId, title } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.title = title;
        chat.updatedAt = new Date();
      }
    },
    
    deleteChat: (state, action: PayloadAction<string>) => {
      const chatId = action.payload;
      state.chats = state.chats.filter(c => c.id !== chatId);
      
      // If we deleted the current chat, switch to the first available chat
      if (state.currentChatId === chatId) {
        state.currentChatId = state.chats.length > 0 ? state.chats[0].id : null;
      }
    },

    setChatBackendContext: (
      state,
      action: PayloadAction<{
        chatId: string;
        conversationId?: string;
        sessionId?: string;
        stage?: string;
      }>
    ) => {
      const { chatId, conversationId, sessionId, stage } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (!chat) return;
      if (conversationId) chat.backendConversationId = conversationId;
      if (sessionId) chat.backendSessionId = sessionId;
      if (stage) chat.backendStage = stage;
      chat.updatedAt = new Date();
    },

    updateMessageContent: (
      state,
      action: PayloadAction<{ chatId: string; messageId: string; content: string }>
    ) => {
      const { chatId, messageId, content } = action.payload;
      const chat = state.chats.find(c => c.id === chatId);
      if (!chat) return;
      const msg = chat.messages.find(m => m.id === messageId);
      if (!msg) return;
      msg.content = content;
      chat.updatedAt = new Date();
    },
    
    addAttachment: (state, action: PayloadAction<{ file: File; type: 'image' | 'document'; preview?: string }>) => {
      state.attachedFiles.push(action.payload);
    },
    
    removeAttachment: (state, action: PayloadAction<number>) => {
      state.attachedFiles.splice(action.payload, 1);
    },
    
    clearAttachments: (state) => {
      state.attachedFiles = [];
    },

    /** Merge or insert chats loaded from GET /Conversation (history). */
    upsertChatsFromHistory: (state, action: PayloadAction<Chat[]>) => {
      for (const incoming of action.payload) {
        const dupeLocal = state.chats.find(
          (c) => c.backendConversationId === incoming.id && c.id !== incoming.id
        );
        if (dupeLocal && state.currentChatId === dupeLocal.id) {
          state.currentChatId = incoming.id;
        }
        state.chats = state.chats.filter(
          (c) => !(c.backendConversationId === incoming.id && c.id !== incoming.id)
        );

        const idx = state.chats.findIndex((c) => c.id === incoming.id);
        if (idx >= 0) {
          const existing = state.chats[idx];
          state.chats[idx] = {
            ...existing,
            ...incoming,
            messages:
              incoming.messages.length > 0 ? incoming.messages : existing.messages,
          };
        } else {
          state.chats.push(incoming);
        }
      }
      state.chats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },

    replaceChatMessages: (
      state,
      action: PayloadAction<{
        chatId: string;
        messages: Message[];
        title?: string;
        historyPagination?: ChatHistoryPagination | null;
      }>
    ) => {
      const { chatId, messages, title, historyPagination } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) return;
      chat.messages = messages;
      if (title?.trim()) chat.title = title.trim();
      if (historyPagination === null) {
        delete chat.historyPagination;
      } else if (historyPagination !== undefined) {
        chat.historyPagination = historyPagination;
      }
      chat.updatedAt = new Date();
    },

    prependChatMessages: (
      state,
      action: PayloadAction<{
        chatId: string;
        messages: Message[];
        historyPagination: ChatHistoryPagination;
      }>
    ) => {
      const { chatId, messages, historyPagination } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) return;
      const existingIds = new Set(chat.messages.map((m) => m.id));
      const merged = [...messages.filter((m) => !existingIds.has(m.id)), ...chat.messages];
      merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      chat.messages = merged;
      chat.historyPagination = historyPagination;
      chat.updatedAt = new Date();
    },

    setChatHistoryLoadingOlder: (
      state,
      action: PayloadAction<{ chatId: string; loading: boolean }>
    ) => {
      const chat = state.chats.find((c) => c.id === action.payload.chatId);
      if (!chat?.historyPagination) return;
      chat.historyPagination = {
        ...chat.historyPagination,
        loadingOlder: action.payload.loading,
      };
    },
  },
});

export const {
  createNewChat,
  switchChat,
  addMessage,
  setChatBackendContext,
  updateMessageContent,
  updateChatTitle,
  deleteChat,
  addAttachment,
  removeAttachment,
  clearAttachments,
  upsertChatsFromHistory,
  replaceChatMessages,
  prependChatMessages,
  setChatHistoryLoadingOlder,
} = chatSlice.actions;

// Selectors
export const selectCurrentChat = (state: { chat: ChatState }) => {
  const { chats, currentChatId } = state.chat;
  if (!currentChatId) return null;
  return chats.find(chat => chat.id === currentChatId) || null;
};

export const selectAllChats = (state: { chat: ChatState }) => state.chat.chats;
export const selectCurrentChatId = (state: { chat: ChatState }) => state.chat.currentChatId;
export const selectAttachedFiles = (state: { chat: ChatState }) => state.chat.attachedFiles;

export default chatSlice.reducer;
