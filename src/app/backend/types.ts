// Request/response DTOs aligned with HRAgent BasicchatController (KickoffRequestViewModel, ChatMessageRequest, ChatMessage).

export interface KickoffRequestViewModel {
  message: string;
  sessionId?: string;
  url?: string;
  label?: string;
  alt?: string;
}

export interface ChatMessageRequest {
  text?: string;
  conversationId?: string;
  sessionId?: string;
  url?: string;
  label?: string;
  alt?: string;
}

export interface ChatMessage {
  id?: string;
  conversationId?: string;
  sessionId?: string;
  role?: string;
  text?: string;
  url?: string;
  label?: string;
  alt?: string;
  stage?: string;
  creationDate?: string;
  nextPossibleIntents?: Record<string, string>;
}

export interface ChatStreamChunk {
  conversationId?: string;
  sessionId?: string;
  chunk: string;
  isFinal?: boolean;
  role?: string;
}

