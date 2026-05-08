import { OpenRouterClient } from './client';

let cachedClient: OpenRouterClient | null = null;

/**
 * Returns the shared OpenRouter client. Reads `OPENROUTER_API_KEY` from env
 * on first call. Throws `MissingOpenRouterKeyError` if the key isn't set —
 * routes should catch this and 500 with a configuration message.
 */
export function getOpenRouterClient(): OpenRouterClient {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new MissingOpenRouterKeyError();
  }
  cachedClient = new OpenRouterClient(apiKey);
  return cachedClient;
}

export class MissingOpenRouterKeyError extends Error {
  constructor() {
    super('OPENROUTER_API_KEY is not configured on the server');
    this.name = 'MissingOpenRouterKeyError';
  }
}

/** Test helper: replace the cached client. */
export function setOpenRouterClientForTesting(client: OpenRouterClient | null): void {
  cachedClient = client;
}
