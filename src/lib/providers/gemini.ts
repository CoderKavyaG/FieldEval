import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import type { VisionProvider, InferInput } from './types';
import type { ModelResult } from '@/lib/schema';
import { parseDefensively, buildStrictRetryPrompt } from '@/lib/parser';

if (typeof window !== 'undefined') {
  throw new Error('GeminiProvider must never be imported from client components.');
}

/**
 * Gemini Provider
 * Implements VisionProvider using the official @google/genai SDK for Gemma 4 & Gemini models.
 */
export class GeminiProvider implements VisionProvider {
  readonly id = 'gemini';

  private getClient(): { ai: GoogleGenAI; modelId: string } {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in server environment.');
    }
    const modelId = process.env.MODEL_ID || 'gemma-4-31b-it';
    const ai = new GoogleGenAI({ apiKey });
    return { ai, modelId };
  }

  private isRetryableHttpError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const status = (err as { status?: number; statusCode?: number }).status ??
                   (err as { status?: number; statusCode?: number }).statusCode;
    if (typeof status === 'number') {
      return status === 429 || (status >= 500 && status < 600);
    }
    const msg = (err as Error).message || '';
    return msg.includes('429') || msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504');
  }

  private isRateLimitError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const status = (err as { status?: number }).status;
    if (status === 429) return true;
    const msg = (err as Error).message || '';
    return msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource_exhausted');
  }

  private isAbortError(err: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) return true;
    if (err instanceof Error) {
      return err.name === 'AbortError' || err.message.toLowerCase().includes('abort');
    }
    return false;
  }

  async infer(input: InferInput): Promise<ModelResult> {
    const { image, mimeType, task, promptOverride, signal } = input;
    const { ai, modelId } = this.getClient();

    // Normalize image to base64 string
    let imageBase64: string;
    if (typeof image === 'string') {
      imageBase64 = image;
    } else {
      imageBase64 = Buffer.from(image).toString('base64');
    }

    const basePrompt = promptOverride || task.promptTemplate;
    const startTime = performance.now();
    let totalAttempts = 0;

    interface ModelCallResult {
      text: string;
      usage?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        thoughtsTokenCount?: number;
      };
    }

    const callModel = async (promptText: string, useThinking = true): Promise<ModelCallResult> => {
      totalAttempts++;
      const config: Record<string, unknown> = {
        temperature: 0,
      };
      if (useThinking) {
        config.thinkingConfig = {
          thinkingLevel: 'minimal',
        };
      }
      if (signal) {
        config.abortSignal = signal;
      }

      // Payload: Image part first, then text part
      const contents = [
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        {
          text: promptText,
        },
      ];

      try {
        const response = await ai.models.generateContent({
          model: modelId,
          contents,
          config,
        });

        return {
          text: response.text || '',
          usage: response.usageMetadata
            ? {
                promptTokenCount: response.usageMetadata.promptTokenCount,
                candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
                totalTokenCount: response.usageMetadata.totalTokenCount,
                thoughtsTokenCount: response.usageMetadata.thoughtsTokenCount,
              }
            : undefined,
        };
      } catch (err) {
        // One retry only on 429 or 5xx with jitter
        if (this.isRetryableHttpError(err) && totalAttempts === 1 && !signal?.aborted) {
          const jitterMs = 400 + Math.floor(Math.random() * 400);
          await new Promise(resolve => setTimeout(resolve, jitterMs));

          // If it was a 500 error that might be thinkingConfig incompatibility, retry without thinkingConfig
          const is500 = (err as { status?: number }).status === 500 || (err as Error).message?.includes('500');
          return await callModel(promptText, is500 ? false : useThinking);
        }
        throw err;
      }
    };

    try {
      // 1. Provider Call Span
      const call1 = await Sentry.startSpan(
        {
          name: 'provider_call',
          op: 'gen_ai.generate_content',
          attributes: {
            'gen_ai.request.model': modelId,
            model_id: modelId,
            attempts: 1,
          },
        },
        async span => {
          const callStart = performance.now();
          try {
            const res = await callModel(basePrompt);
            const callLatency = Math.round(performance.now() - callStart);
            span.setAttribute('latency_ms', callLatency);
            span.setAttribute('status', 'ok');

            if (res.usage) {
              if (res.usage.promptTokenCount !== undefined) {
                span.setAttribute('gen_ai.usage.prompt_tokens', res.usage.promptTokenCount);
                span.setAttribute('prompt_tokens', res.usage.promptTokenCount);
              }
              if (res.usage.candidatesTokenCount !== undefined) {
                span.setAttribute('gen_ai.usage.completion_tokens', res.usage.candidatesTokenCount);
                span.setAttribute('completion_tokens', res.usage.candidatesTokenCount);
              }
              if (res.usage.totalTokenCount !== undefined) {
                span.setAttribute('gen_ai.usage.total_tokens', res.usage.totalTokenCount);
                span.setAttribute('total_tokens', res.usage.totalTokenCount);
              }
              if (res.usage.thoughtsTokenCount !== undefined) {
                span.setAttribute('thoughts_tokens', res.usage.thoughtsTokenCount);
              }
            }
            return res;
          } catch (err) {
            const callLatency = Math.round(performance.now() - callStart);
            span.setAttribute('latency_ms', callLatency);
            span.setAttribute('status', 'error');
            throw err;
          }
        }
      );

      // 2. Parse Span
      const parsed1 = Sentry.startSpan(
        {
          name: 'parse',
          op: 'gen_ai.parse',
          attributes: {
            attempts: 1,
          },
        },
        span => {
          const parseStart = performance.now();
          const result = parseDefensively(call1.text);
          const parseLatency = Math.round(performance.now() - parseStart);
          span.setAttribute('latency_ms', parseLatency);
          span.setAttribute('status', result.ok ? 'ok' : 'invalid_output');
          return result;
        }
      );

      if (parsed1.ok) {
        const latencyMs = Math.round(performance.now() - startTime);
        return {
          status: 'ok',
          answer: parsed1.data.answer,
          rationale: parsed1.data.rationale,
          selfConfidence: parsed1.data.selfConfidence,
          latencyMs,
          latency_ms: latencyMs,
          attempts: totalAttempts,
          rawOutput: call1.text,
          errorMessage: null,
          promptTokens: call1.usage?.promptTokenCount,
          completionTokens: call1.usage?.candidatesTokenCount,
          totalTokens: call1.usage?.totalTokenCount,
        };
      }

      // 3. Retry Span (triggered if initial parse fails)
      const retryResult = await Sentry.startSpan(
        {
          name: 'retry',
          op: 'gen_ai.retry',
          attributes: {
            'gen_ai.request.model': modelId,
            model_id: modelId,
            attempts: 2,
          },
        },
        async span => {
          const retryStart = performance.now();
          const strictPrompt = buildStrictRetryPrompt(basePrompt);
          const call2 = await callModel(strictPrompt);
          const parsed2 = parseDefensively(call2.text);
          const retryLatency = Math.round(performance.now() - retryStart);
          span.setAttribute('latency_ms', retryLatency);
          span.setAttribute('status', parsed2.ok ? 'ok' : 'invalid_output');

          if (call2.usage) {
            if (call2.usage.promptTokenCount !== undefined) {
              span.setAttribute('gen_ai.usage.prompt_tokens', call2.usage.promptTokenCount);
              span.setAttribute('prompt_tokens', call2.usage.promptTokenCount);
            }
            if (call2.usage.candidatesTokenCount !== undefined) {
              span.setAttribute('gen_ai.usage.completion_tokens', call2.usage.candidatesTokenCount);
              span.setAttribute('completion_tokens', call2.usage.candidatesTokenCount);
            }
            if (call2.usage.totalTokenCount !== undefined) {
              span.setAttribute('gen_ai.usage.total_tokens', call2.usage.totalTokenCount);
              span.setAttribute('total_tokens', call2.usage.totalTokenCount);
            }
          }
          return { call2, parsed2 };
        }
      );

      const latencyMs = Math.round(performance.now() - startTime);
      if (retryResult.parsed2.ok) {
        return {
          status: 'ok',
          answer: retryResult.parsed2.data.answer,
          rationale: retryResult.parsed2.data.rationale,
          selfConfidence: retryResult.parsed2.data.selfConfidence,
          latencyMs,
          latency_ms: latencyMs,
          attempts: totalAttempts,
          rawOutput: retryResult.call2.text,
          errorMessage: null,
          promptTokens: retryResult.call2.usage?.promptTokenCount,
          completionTokens: retryResult.call2.usage?.candidatesTokenCount,
          totalTokens: retryResult.call2.usage?.totalTokenCount,
        };
      }

      // Defensive handling: record invalid_output, never fabricate an answer
      return {
        status: 'invalid_output',
        answer: null,
        rationale: retryResult.parsed2.error || parsed1.error,
        selfConfidence: null,
        latencyMs,
        latency_ms: latencyMs,
        attempts: totalAttempts,
        rawOutput: retryResult.call2.text || call1.text,
        errorMessage: `Model output could not be parsed as valid JSON: ${retryResult.parsed2.error}`,
        promptTokens: retryResult.call2.usage?.promptTokenCount || call1.usage?.promptTokenCount,
        completionTokens: retryResult.call2.usage?.candidatesTokenCount || call1.usage?.candidatesTokenCount,
        totalTokens: retryResult.call2.usage?.totalTokenCount || call1.usage?.totalTokenCount,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);

      if (this.isAbortError(err, signal)) {
        return {
          status: 'timeout',
          answer: null,
          rationale: null,
          selfConfidence: null,
          latencyMs,
          latency_ms: latencyMs,
          attempts: totalAttempts || 1,
          errorMessage: 'Inference request timed out after 30 seconds.',
          rawOutput: null,
        };
      }

      if (this.isRateLimitError(err)) {
        return {
          status: 'rate_limited',
          answer: null,
          rationale: null,
          selfConfidence: null,
          latencyMs,
          latency_ms: latencyMs,
          attempts: totalAttempts || 1,
          errorMessage: 'API rate limit or quota exceeded.',
          rawOutput: null,
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        answer: null,
        rationale: null,
        selfConfidence: null,
        latencyMs,
        latency_ms: latencyMs,
        attempts: totalAttempts || 1,
        errorMessage: message.replace(process.env.GEMINI_API_KEY || '', '[REDACTED]'),
        rawOutput: null,
      };
    }
  }
}
