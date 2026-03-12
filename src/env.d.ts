/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_HRMS_TOKEN_KEY?: string;
  readonly VITE_STATIC_HRMS_TOKEN?: string;
  readonly VITE_SIGNALR_LOG_LEVEL?: string;
  /** Stream event name (e.g. ChatMsgStream, EVENT_CHAT_MSG_STREAM). Default: ChatMsgStream */
  readonly VITE_SIGNALR_STREAM_EVENT?: string;
  /** Index of text chunk in backend args (default 3). */
  readonly VITE_SIGNALR_MSG_CHUNK_INDEX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
