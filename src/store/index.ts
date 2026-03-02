import { createStore } from 'vuex';

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  format?: 'text' | 'code' | 'list' | 'table' | 'quote' | 'steps' | 'warning' | 'sections' | 'comparison';
  codeLanguage?: string;
  items?: string[];
  tableData?: {
    headers: string[];
    rows: string[][];
  };
  steps?: Array<{ title: string; description: string }>;
  sections?: Array<{ title: string; content: string }>;
  comparisonData?: {
    columns: Array<{ title: string; items: string[] }>;
  };
}

export interface FileAttachment {
  file: File;
  type: 'image' | 'document';
}

export interface State {
  isDark: boolean;
  sidebarOpen: boolean;
  messages: Message[];
  attachedFiles: FileAttachment[];
}

export default createStore<State>({
  state: {
    isDark: true,
    sidebarOpen: true,
    messages: [],
    attachedFiles: [],
  },
  mutations: {
    TOGGLE_THEME(state) {
      state.isDark = !state.isDark;
      if (state.isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    },
    SET_THEME(state, isDark: boolean) {
      state.isDark = isDark;
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    },
    TOGGLE_SIDEBAR(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    SET_SIDEBAR(state, isOpen: boolean) {
      state.sidebarOpen = isOpen;
    },
    ADD_MESSAGE(state, message: Message) {
      state.messages.push(message);
    },
    SET_MESSAGES(state, messages: Message[]) {
      state.messages = messages;
    },
    ADD_ATTACHMENT(state, attachment: FileAttachment) {
      state.attachedFiles.push(attachment);
    },
    REMOVE_ATTACHMENT(state, index: number) {
      state.attachedFiles.splice(index, 1);
    },
    CLEAR_ATTACHMENTS(state) {
      state.attachedFiles = [];
    },
  },
  actions: {
    toggleTheme({ commit }) {
      commit('TOGGLE_THEME');
    },
    setTheme({ commit }, isDark: boolean) {
      commit('SET_THEME', isDark);
    },
    toggleSidebar({ commit }) {
      commit('TOGGLE_SIDEBAR');
    },
    setSidebar({ commit }, isOpen: boolean) {
      commit('SET_SIDEBAR', isOpen);
    },
    addMessage({ commit }, message: Message) {
      commit('ADD_MESSAGE', message);
    },
    setMessages({ commit }, messages: Message[]) {
      commit('SET_MESSAGES', messages);
    },
    addAttachment({ commit }, attachment: FileAttachment) {
      commit('ADD_ATTACHMENT', attachment);
    },
    removeAttachment({ commit }, index: number) {
      commit('REMOVE_ATTACHMENT', index);
    },
    clearAttachments({ commit }) {
      commit('CLEAR_ATTACHMENTS');
    },
  },
  getters: {
    isDark: (state) => state.isDark,
    sidebarOpen: (state) => state.sidebarOpen,
    messages: (state) => state.messages,
    attachedFiles: (state) => state.attachedFiles,
  },
});
