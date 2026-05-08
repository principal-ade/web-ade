export {
  OpenRouterClient,
  OpenRouterError,
  DEFAULT_MODEL,
  type ChatMessage,
  type ChatCompletionOptions,
  type ChatCompletionResult,
} from './client';
export {
  getOpenRouterClient,
  setOpenRouterClientForTesting,
  MissingOpenRouterKeyError,
} from './factory';
