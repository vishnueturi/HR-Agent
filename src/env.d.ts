/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_HRMS_TOKEN_KEY?: string;
  readonly VITE_STATIC_HRMS_TOKEN?: string;
  readonly VITE_SIGNALR_LOG_LEVEL?: string;
  /** Stream event name (e.g. StreamChat, ChatMsgStream). Default: StreamChat */
  readonly VITE_SIGNALR_STREAM_EVENT?: string;
  /** Index of text chunk in backend args (default 3). */
  readonly VITE_SIGNALR_MSG_CHUNK_INDEX?: string;
  /** Chat API: "Basicchat" (HRAgent) or "AssistingAgent" (Recco.App style). Default: Basicchat */
  readonly VITE_CHAT_API?: string;
  /** If "true", send request bodies with PascalCase (Message, SessionId, etc.) for .NET. */
  readonly VITE_API_JSON_PASCAL_CASE?: string;
  /** Base URL for GET /Conversation (history list). Default: https://hragents.azurewebsites.net */
  readonly VITE_CONVERSATION_HISTORY_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
