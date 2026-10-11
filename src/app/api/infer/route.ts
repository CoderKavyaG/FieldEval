import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { getTaskById } from '@/data/tasks';
import { getVisionProvider } from '@/lib/providers';
import type { ModelResult } from '@/lib/schema';
import { rateLimiterState as state } from '@/lib/rate-limiter';

const RequestSchema = z.object({
  imageBase64: z.string().min(1, 'imageBase64 must not be empty'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    errorMap: () => ({ message: 'Invalid mimeType. Only image/jpeg, image/png, and image/webp are allowed.' }),
  }),
  taskId: z.string().min(1, 'taskId is required'),
  sessionId: z.string().min(1, 'sessionId is required'),
});

const MAX_DECODED_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

// Allow up to 60 seconds execution time on Vercel Hobby (free) plan
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const modelId = process.env.MODEL_ID || 'gemma-4-31b-it';
  const pipelineStartTime = performance.now();

  return await Sentry.startSpan(
    {
      name: 'FieldEval Inference Pipeline',
      op: 'gen_ai.inference_pipeline',
      attributes: {
        'gen_ai.request.model': modelId,
        model_id: modelId,
      },
    },
    async (rootSpan) => {
      // 1. Validate Span
      let rawBody: unknown;
      try {
        rawBody = await req.json();
      } catch {
        const valLatency = Math.round(performance.now() - pipelineStartTime);
        rootSpan.setAttribute('status', 'error');
        rootSpan.setAttribute('latency_ms', valLatency);
        rootSpan.setAttribute('attempts', 0);
        return NextResponse.json<ModelResult>(
          {
            status: 'error',
            answer: null,
            rationale: null,
            selfConfidence: null,
            latencyMs: 0,
            latency_ms: 0,
            attempts: 0,
            errorMessage: 'Invalid JSON request payload.',
          },
          { status: 400 }
        );
      }

      const valStart = performance.now();
      const validation = Sentry.startSpan(
        {
          name: 'validate',
          op: 'gen_ai.validate',
        },
        (valSpan) => {
          // Schema Validation
          const parsed = RequestSchema.safeParse(rawBody);
          if (!parsed.success) {
            const errorDetails = parsed.error.errors.map((e) => e.message).join('; ');
            valSpan.setAttribute('status', 'error');
            valSpan.setAttribute('latency_ms', Math.round(performance.now() - valStart));
            valSpan.setAttribute('attempts', 1);
            return {
              ok: false as const,
              status: 400,
              message: `Validation failed: ${errorDetails}`,
            };
          }

          const { imageBase64, mimeType, taskId, sessionId } = parsed.data;
          valSpan.setAttribute('task_id', taskId);
          valSpan.setAttribute('session_id', sessionId);
          valSpan.setAttribute('mime_type', mimeType);

          // Verify task exists in deck
          const task = getTaskById(taskId);
          if (!task) {
            valSpan.setAttribute('status', 'error');
            valSpan.setAttribute('latency_ms', Math.round(performance.now() - valStart));
            valSpan.setAttribute('attempts', 1);
            return {
              ok: false as const,
              status: 400,
              message: `Unknown taskId: "${taskId}". Prompt must be resolved from known tasks.`,
            };
          }

          // Verify decoded image size <= 1.5MB
          const padding = imageBase64.endsWith('==') ? 2 : imageBase64.endsWith('=') ? 1 : 0;
          const decodedSize = (imageBase64.length * 3) / 4 - padding;
          if (decodedSize > MAX_DECODED_BYTES) {
            valSpan.setAttribute('status', 'error');
            valSpan.setAttribute('latency_ms', Math.round(performance.now() - valStart));
            valSpan.setAttribute('attempts', 1);
            return {
              ok: false as const,
              status: 400,
              message: `Decoded image size (${Math.round(decodedSize)} bytes) exceeds the 1.5MB limit.`,
            };
          }

          // Rate Limiting (20 req/hour per IP & global DAILY_CAP)
          const forwarded = req.headers.get('x-forwarded-for');
          const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || '127.0.0.1';
          const now = Date.now();
          const today = new Date().toISOString().slice(0, 10);

          const dailyCap = parseInt(process.env.DAILY_CAP || '300', 10);
          if (state.currentDay !== today) {
            state.currentDay = today;
            state.dailyCount = 0;
          }
          if (state.dailyCount >= dailyCap) {
            valSpan.setAttribute('status', 'rate_limited');
            valSpan.setAttribute('latency_ms', Math.round(performance.now() - valStart));
            valSpan.setAttribute('attempts', 1);
            return {
              ok: false as const,
              status: 429,
              message: `Global daily inference limit of ${dailyCap} requests reached. Try again tomorrow.`,
              rateLimited: true,
            };
          }

          const oneHourAgo = now - 60 * 60 * 1000;
          const timestamps = (state.ipTimestamps.get(clientIp) || []).filter((t) => t > oneHourAgo);
          if (timestamps.length >= 20) {
            valSpan.setAttribute('status', 'rate_limited');
            valSpan.setAttribute('latency_ms', Math.round(performance.now() - valStart));
            valSpan.setAttribute('attempts', 1);
            return {
              ok: false as const,
              status: 429,
              message: 'Rate limit exceeded: Maximum 20 requests per IP per hour. Please wait before retrying.',
              rateLimited: true,
            };
          }

          timestamps.push(now);
          state.ipTimestamps.set(clientIp, timestamps);
          state.dailyCount++;

          const valLatency = Math.round(performance.now() - valStart);
          valSpan.setAttribute('latency_ms', valLatency);
          valSpan.setAttribute('status', 'ok');
          valSpan.setAttribute('attempts', 1);

          return {
            ok: true as const,
            data: { imageBase64, mimeType, task, taskId, sessionId },
          };
        }
      );

      if (!validation.ok) {
        const valLatency = Math.round(performance.now() - pipelineStartTime);
        rootSpan.setAttribute('status', validation.rateLimited ? 'rate_limited' : 'error');
        rootSpan.setAttribute('latency_ms', valLatency);
        rootSpan.setAttribute('attempts', 0);
        return NextResponse.json<ModelResult>(
          {
            status: validation.rateLimited ? 'rate_limited' : 'error',
            answer: null,
            rationale: null,
            selfConfidence: null,
            latencyMs: 0,
            latency_ms: 0,
            attempts: 0,
            errorMessage: validation.message,
          },
          { status: validation.status }
        );
      }

      const { imageBase64, mimeType, task, taskId, sessionId } = validation.data;
      rootSpan.setAttribute('task_id', taskId);
      rootSpan.setAttribute('session_id', sessionId);

      // 2. AbortController 60s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      try {
        const provider = getVisionProvider();
        const result = await provider.infer({
          image: imageBase64,
          mimeType,
          task,
          signal: controller.signal,
        });

        const totalLatency = Math.round(performance.now() - pipelineStartTime);
        rootSpan.setAttribute('status', result.status);
        rootSpan.setAttribute('latency_ms', totalLatency);
        rootSpan.setAttribute('attempts', result.attempts || 1);

        if (result.promptTokens !== undefined) {
          rootSpan.setAttribute('gen_ai.usage.prompt_tokens', result.promptTokens);
          rootSpan.setAttribute('prompt_tokens', result.promptTokens);
        }
        if (result.completionTokens !== undefined) {
          rootSpan.setAttribute('gen_ai.usage.completion_tokens', result.completionTokens);
          rootSpan.setAttribute('completion_tokens', result.completionTokens);
        }
        if (result.totalTokens !== undefined) {
          rootSpan.setAttribute('gen_ai.usage.total_tokens', result.totalTokens);
          rootSpan.setAttribute('total_tokens', result.totalTokens);
        }

        // Security: Log metadata only, never image bytes, prompts or keys
        if (process.env.NODE_ENV !== 'test') {
          await Sentry.flush(2000);
        }

        return NextResponse.json<ModelResult>(result, {
          status: result.status === 'rate_limited' ? 429 : 200,
        });
      } catch (err: unknown) {
        const totalLatency = Math.round(performance.now() - pipelineStartTime);
        rootSpan.setAttribute('status', 'error');
        rootSpan.setAttribute('latency_ms', totalLatency);
        rootSpan.setAttribute('attempts', 1);

        Sentry.captureException(err);
        if (process.env.NODE_ENV !== 'test') {
          await Sentry.flush(2000);
        }

        const message = err instanceof Error ? err.message : 'Unknown server inference failure';
        return NextResponse.json<ModelResult>(
          {
            status: 'error',
            answer: null,
            rationale: null,
            selfConfidence: null,
            latencyMs: 0,
            latency_ms: 0,
            attempts: 1,
            errorMessage: message.replace(process.env.GEMINI_API_KEY || '', '[REDACTED]'),
          },
          { status: 500 }
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }
  );
}
