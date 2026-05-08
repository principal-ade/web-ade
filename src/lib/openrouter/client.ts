/**
 * Centralized OpenRouter chat-completions client.
 *
 * Wraps the HTTP call to `/v1/chat/completions` so per-route code only owns
 * its prompt, parser, temperature, max_tokens, and response_format. Model
 * selection defaults to the `openrouter/free` meta-router, which auto-picks
 * a free model that supports the requested features.
 *
 * Per-route prompts, parsers, and caches stay where they are — see
 * `docs/openrouter-client-abstraction.md` for the scope decision.
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Free meta-router; auto-selects a free model that supports the requested features. */
export const DEFAULT_MODEL = 'openrouter/free';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  /** Per-call X-Title for OpenRouter's dashboard attribution. */
  appTitle: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' };
  /** Override the default model. Use only when a specific model is required. */
  model?: string;
}

export interface ChatCompletionResult {
  content: string;
  /** Model id reported by OpenRouter — useful for logging which model the meta-router picked. */
  model: string;
}

interface OpenRouterApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  error?: { message?: string; code?: number };
}

export class OpenRouterClient {
  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string = DEFAULT_MODEL,
  ) {}

  async chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const body: Record<string, unknown> = {
      model: opts.model ?? this.defaultModel,
      messages: opts.messages,
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts.responseFormat) body.response_format = opts.responseFormat;

    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://web-ade.dev',
        'X-Title': opts.appTitle,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new OpenRouterError(`HTTP ${res.status}: ${txt.slice(0, 300)}`, res.status, txt);
    }

    const data = (await res.json()) as OpenRouterApiResponse;
    if (data.error) {
      throw new OpenRouterError(data.error.message ?? 'unknown error');
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new OpenRouterError('empty response');
    }

    return { content, model: data.model ?? body.model as string };
  }
}

export class OpenRouterError extends Error {
  readonly status?: number;
  readonly raw?: string;

  constructor(message: string, status?: number, raw?: string) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
    this.raw = raw;
  }
}
