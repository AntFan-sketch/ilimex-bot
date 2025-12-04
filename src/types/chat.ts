export interface ChatResponseBody {
  message?: ChatMessage;
  reply?: ChatMessage;
  [key: string]: any;
}
