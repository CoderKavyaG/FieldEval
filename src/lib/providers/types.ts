import type { TaskDef, ModelResult } from '@/lib/schema';

// Providers execute inference exclusively in server contexts to protect API keys
if (typeof window !== 'undefined') {
  throw new Error('VisionProvider must never be imported from client components.');
}

export interface InferInput {
  image: Uint8Array | string; // Uint8Array or base64 string
  mimeType: string;
  task: TaskDef;
  promptOverride?: string;
  signal?: AbortSignal;
}

export interface VisionProvider {
  readonly id: string;
  infer(input: InferInput): Promise<ModelResult>;
}
