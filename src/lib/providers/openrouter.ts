import type { VisionProvider, InferInput } from './types';
import type { ModelResult } from '@/lib/schema';

if (typeof window !== 'undefined') {
  throw new Error('OpenRouterProvider must never be imported from client components.');
}

/**
 * OpenRouter Provider Stub
 * Configured for open-weight model: google/gemma-4-31b-it:free
 * Implements VisionProvider behind the same interface.
 */
export class OpenRouterProvider implements VisionProvider {
  readonly id = 'openrouter';
  readonly model = 'google/gemma-4-31b-it:free';

  async infer(_input: InferInput): Promise<ModelResult> {
    throw new Error(
      `OpenRouter vision provider (model: ${this.model}) is not implemented. Set PROVIDER=gemini to use the active Google GenAI provider.`
    );
  }
}
