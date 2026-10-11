import { z } from 'zod';

// Task definition describing each challenge in the deck
export const ShotInstructionSchema = z.object({
  shotIndex: z.enum(['A', 'B']),
  instruction: z.string(),
  lighting: z.string(),
}).strict();

export const TaskDefSchema = z.object({
  id: z.string(),
  sceneNumber: z.number().int().min(1).max(6),
  title: z.string(),
  question: z.string(),
  inputType: z.enum(['stepper', 'choice', 'digits']),
  options: z.array(z.string()).optional(),
  promptVersion: z.literal('p1'),
  promptTemplate: z.string(),
  shots: z.tuple([ShotInstructionSchema, ShotInstructionSchema]),
}).strict();

export type TaskDef = z.infer<typeof TaskDefSchema>;

// Raw model evaluation result returned from provider
export const ModelResultSchema = z.object({
  status: z.enum(['ok', 'invalid_output', 'timeout', 'rate_limited', 'error']),
  answer: z.string().nullable(),
  rationale: z.string().max(200).nullable(),
  selfConfidence: z.number().min(0).max(1).nullable(),
  latencyMs: z.number().int().nonnegative(),
  latency_ms: z.number().int().nonnegative().optional(),
  attempts: z.number().int().positive().optional(),
  rawOutput: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
}).strict();

export type ModelResult = z.infer<typeof ModelResultSchema>;

// Observation lifecycle: 'captured' (photo ready, awaiting answer) -> 'locked' -> 'scored' | 'offline' | 'pending_model'
export const ObservationStatusSchema = z.enum(['captured', 'locked', 'scored', 'offline', 'pending_model']);
export type ObservationStatus = z.infer<typeof ObservationStatusSchema>;

// Evaluation scoring outcome classification
export const ScoreOutcomeSchema = z.enum([
  'correct',
  'incorrect',
  'excluded_unsure',
  'excluded_revised',
  'excluded_invalid',
]);
export type ScoreOutcome = z.infer<typeof ScoreOutcomeSchema>;

// Observation record captured in the field
export const ObservationSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  taskId: z.string(),
  shotIndex: z.enum(['A', 'B']),
  blobKey: z.string(),
  imageHash: z.string().optional(),
  imageSha256: z.string().optional(),
  image_sha256: z.string().optional(),
  imageWidth: z.number().int().positive().optional(),
  image_width: z.number().int().positive().optional(),
  imageHeight: z.number().int().positive().optional(),
  image_height: z.number().int().positive().optional(),
  status: ObservationStatusSchema.default('captured'),
  userAnswer: z.string().nullable().optional(),
  originalUserAnswer: z.string().nullable().optional(),
  original_user_answer: z.string().nullable().optional(),
  userUnsure: z.boolean().default(false),
  lockedAt: z.string().datetime().nullable().optional(),
  locked_at: z.string().datetime().nullable().optional(),
  revisedAfterReveal: z.boolean().default(false).optional(),
  revised_after_reveal: z.boolean().default(false).optional(),
  modelResult: ModelResultSchema.nullable().optional(),
  outcome: ScoreOutcomeSchema.nullable().optional(),
  matched: z.boolean().nullable().optional(),
  excluded: z.boolean().default(false),
  capturedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
}).strict();

export type Observation = z.infer<typeof ObservationSchema>;

// Export record formatted for JSONL benchmarking export (schema_version fieldeval.v1)
export const ExportRecordSchema = z.object({
  schema_version: z.literal('fieldeval.v1'),
  session_id: z.string().uuid(),
  observation_id: z.string().uuid(),
  task_id: z.string(),
  shot_index: z.enum(['A', 'B']),
  question: z.string(),
  prompt_version: z.literal('p1'),
  user_answer: z.string(),
  user_unsure: z.boolean(),
  revised_after_reveal: z.boolean().default(false),
  model_status: z.enum(['ok', 'invalid_output', 'timeout', 'rate_limited', 'error']),
  model_answer: z.string().nullable(),
  model_rationale: z.string().max(200).nullable(),
  model_confidence: z.number().nullable(),
  latency_ms: z.number().int().nonnegative(),
  outcome: ScoreOutcomeSchema.optional(),
  matched: z.boolean(),
  excluded: z.boolean(),
  image_sha256: z.string(),
  image_width: z.number().int().positive(),
  image_height: z.number().int().positive(),
  timestamp: z.string().datetime(),
}).strict();

export type ExportRecord = z.infer<typeof ExportRecordSchema>;
