import type { VisionProvider } from './types';
import { GeminiProvider } from './gemini';
import { OpenRouterProvider } from './openrouter';

if (typeof window !== 'undefined') {
  throw new Error('Provider loader must never be imported from client components.');
}

/**
 * Resolves vision model provider based on PROVIDER environment variable.
 * Default: gemini
 */
export function getVisionProvider(): VisionProvider {
  const providerKey = (process.env.PROVIDER || 'gemini').toLowerCase();

  switch (providerKey) {
    case 'gemini':
      return new GeminiProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    default:
      throw new Error(`Unsupported PROVIDER: "${providerKey}". Expected gemini | openrouter.`);
  }
}

export * from './types';
export { GeminiProvider } from './gemini';
export { OpenRouterProvider } from './openrouter';
