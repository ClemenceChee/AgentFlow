/**
 * LLM provider factories — zero-dep, native fetch() only.
 *
 * Creates AnalysisFn and EmbedFn from common providers:
 * OpenRouter, Anthropic, OpenAI, or any OpenAI-compatible endpoint.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AnalysisFn, EmbedFn } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  /** Provider name. 'custom' uses baseUrl with OpenAI-compatible format. */
  provider: 'openrouter' | 'anthropic' | 'openai' | 'custom';
  /** Model identifier (e.g., 'moonshotai/kimi-k2.5', 'claude-sonnet-4-20250514', 'gpt-4o'). */
  model: string;
  /** API key. Falls back to env vars if not provided. */
  apiKey?: string;
  /** Base URL for custom/local endpoints (e.g., 'http://localhost:11434/v1'). */
  baseUrl?: string;
  /** Embedding model (e.g., 'text-embedding-3-small'). If set, embedFn is returned. */
  embeddingModel?: string;
  /** Max tokens for completion responses. Default: 2048. */
  maxTokens?: number;
}

export interface ProviderResult {
  /** LLM completion function for the Synthesizer. */
  analysisFn: AnalysisFn;
  /** Embedding function for the Cartographer. Null if no embedding model configured. */
  embedFn: EmbedFn | null;
  /** Resolved provider name. */
  provider: string;
  /** Resolved model name. */
  model: string;
}

// ---------------------------------------------------------------------------
// API key resolution
// ---------------------------------------------------------------------------

const PROVIDER_ENV_VARS: Record<string, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  custom: 'SOMA_API_KEY',
};

/**
 * Resolve API key from: explicit config → SOMA_API_KEY → provider env var → ~/.env file.
 */
function resolveApiKey(config: ProviderConfig): string {
  // 1. Explicit
  if (config.apiKey) return config.apiKey;

  // 2. SOMA_API_KEY (universal override)
  if (process.env.SOMA_API_KEY) return process.env.SOMA_API_KEY;

  // 3. Provider-specific env var
  const envVar = PROVIDER_ENV_VARS[config.provider];
  if (envVar && process.env[envVar]) return process.env[envVar]!;

  // 4. Read from ~/.env file (common local dev pattern)
  if (envVar) {
    const dotenvKey = readDotenvKey(envVar);
    if (dotenvKey) return dotenvKey;
  }

  throw new Error(
    `No API key found for provider "${config.provider}". ` +
      `Set ${envVar ?? 'SOMA_API_KEY'} env var or pass --api-key.`,
  );
}

/**
 * Read a key from ~/.env file (KEY=value format, one per line).
 */
function readDotenvKey(varName: string): string | null {
  try {
    const envPath = join(homedir(), '.env');
    if (!existsSync(envPath)) return null;
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key === varName) return value;
    }
    return null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Failed to read ${join(homedir(), '.env')}: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat completion (covers OpenRouter, OpenAI, custom)
// ---------------------------------------------------------------------------

const BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
};

function createOpenAICompatibleAnalysisFn(
  baseUrl: string,
  model: string,
  apiKey: string,
  maxTokens: number,
): AnalysisFn {
  return async (prompt: string): Promise<string> => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? '';
  };
}

// ---------------------------------------------------------------------------
// Anthropic messages API
// ---------------------------------------------------------------------------

function createAnthropicAnalysisFn(apiKey: string, model: string, maxTokens: number): AnalysisFn {
  return async (prompt: string): Promise<string> => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    return data.content?.find((c) => c.type === 'text')?.text ?? '';
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible embeddings
// ---------------------------------------------------------------------------

function createOpenAICompatibleEmbedFn(baseUrl: string, model: string, apiKey: string): EmbedFn {
  return async (text: string): Promise<number[] | null> => {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 8000), // Limit input length
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = data.data?.[0]?.embedding;
    if (!embedding) {
      console.warn('[Embedding] API response missing embedding data, returning null');
      return null;
    }
    return embedding;
  };
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

/**
 * Create LLM provider functions from configuration.
 *
 * @example
 * ```ts
 * const { analysisFn, embedFn } = createProvider({
 *   provider: 'openrouter',
 *   model: 'moonshotai/kimi-k2.5',
 * });
 *
 * const soma = createSoma({
 *   analysisFn,
 *   embedFn: embedFn ?? undefined,
 * });
 * ```
 */
export function createProvider(config: ProviderConfig): ProviderResult {
  const apiKey = resolveApiKey(config);
  const maxTokens = config.maxTokens ?? 4096;

  // AnalysisFn
  let analysisFn: AnalysisFn;

  if (config.provider === 'anthropic') {
    analysisFn = createAnthropicAnalysisFn(apiKey, config.model, maxTokens);
  } else {
    const baseUrl = config.baseUrl ?? BASE_URLS[config.provider] ?? config.baseUrl;
    if (!baseUrl)
      throw new Error(`No base URL for provider "${config.provider}". Set baseUrl in config.`);
    analysisFn = createOpenAICompatibleAnalysisFn(baseUrl, config.model, apiKey, maxTokens);
  }

  // EmbedFn (optional)
  let embedFn: EmbedFn | null = null;

  if (config.embeddingModel) {
    // Anthropic doesn't have an embedding API — use OpenAI-compatible endpoint
    const embedBaseUrl =
      config.provider === 'anthropic'
        ? 'https://api.openai.com/v1' // Requires separate OpenAI key
        : (config.baseUrl ?? BASE_URLS[config.provider]);

    if (embedBaseUrl) {
      embedFn = createOpenAICompatibleEmbedFn(embedBaseUrl, config.embeddingModel, apiKey);
    }
  }

  return {
    analysisFn,
    embedFn,
    provider: config.provider,
    model: config.model,
  };
}
