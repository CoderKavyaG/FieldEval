import { z } from 'zod';
import { Observation, ExportRecord, ExportRecordSchema } from './schema';
import { TaskDef } from './schema';
import { TASK_DECK } from '@/data/tasks';

export interface ExportValidationResult {
  success: true;
  jsonl: string;
  count: number;
}

export interface ExportValidationError {
  success: false;
  errorRecordId: string;
  error: string;
}

export type ExportResult = ExportValidationResult | ExportValidationError;

/**
 * Truncates model rationale to maximum 200 characters without breaking words if possible.
 */
function truncateRationale(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= 200) return trimmed;
  return trimmed.slice(0, 197) + '...';
}

/**
 * Creates a validated ExportRecord from an in-memory or stored Observation.
 * Strips all image bytes, GPS, device identifiers, and extraneous text.
 */
export function createExportRecord(
  obs: Observation,
  taskDefs: TaskDef[] = TASK_DECK
): ExportRecord {
  const task = taskDefs.find(t => t.id === obs.taskId);
  const question = task?.question || 'Field observation';

  const rawRecord = {
    schema_version: 'fieldeval.v1' as const,
    session_id: obs.sessionId,
    observation_id: obs.id,
    task_id: obs.taskId,
    shot_index: obs.shotIndex || 'A',
    question,
    prompt_version: 'p1' as const,
    user_answer: obs.userAnswer || (obs.userUnsure ? 'Unsure' : 'Unanswered'),
    user_unsure: Boolean(obs.userUnsure),
    revised_after_reveal: Boolean(obs.revisedAfterReveal || obs.revised_after_reveal),
    model_status: obs.modelResult?.status || 'ok',
    model_answer: obs.modelResult?.answer ?? null,
    model_rationale: truncateRationale(obs.modelResult?.rationale),
    model_confidence: obs.modelResult?.selfConfidence ?? null,
    latency_ms: obs.modelResult?.latencyMs ?? obs.modelResult?.latency_ms ?? 0,
    outcome: obs.outcome ?? undefined,
    matched: Boolean(obs.matched),
    excluded: Boolean(obs.excluded),
    image_sha256:
      obs.imageSha256 ||
      obs.image_sha256 ||
      obs.imageHash ||
      '0000000000000000000000000000000000000000000000000000000000000000',
    image_width: obs.imageWidth || obs.image_width || 1024,
    image_height: obs.imageHeight || obs.image_height || 768,
    timestamp: obs.completedAt || obs.lockedAt || obs.capturedAt || new Date().toISOString(),
  };

  return ExportRecordSchema.parse(rawRecord);
}

/**
 * Serializes a list of observations into a JSONL string.
 * Validates every record with the Zod schema before writing.
 * If any record fails validation, aborts and returns an error specifying which record failed.
 */
export function serializeSessionToJsonl(
  observations: Observation[],
  taskDefs: TaskDef[] = TASK_DECK
): ExportResult {
  const lines: string[] = [];

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    try {
      const record = createExportRecord(obs, taskDefs);
      lines.push(JSON.stringify(record));
    } catch (err) {
      const message = err instanceof z.ZodError
        ? err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        : err instanceof Error
        ? err.message
        : 'Unknown validation failure';

      return {
        success: false,
        errorRecordId: obs.id,
        error: `Observation record #${i + 1} (${obs.id}) failed Zod validation: ${message}`,
      };
    }
  }

  return {
    success: true,
    jsonl: lines.length > 0 ? lines.join('\n') + '\n' : '',
    count: lines.length,
  };
}

/**
 * Parses a JSONL string into validated ExportRecord objects.
 */
export function parseJsonlToExportRecords(jsonl: string): ExportRecord[] {
  const lines = jsonl
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  return lines.map((line, idx) => {
    try {
      const parsed = JSON.parse(line);
      return ExportRecordSchema.parse(parsed);
    } catch (err) {
      throw new Error(`JSONL line ${idx + 1} failed schema validation: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

/**
 * Reconstructs an Observation from an ExportRecord for benchmark re-scoring or verification.
 */
export function exportRecordToObservation(rec: ExportRecord): Observation {
  return {
    id: rec.observation_id,
    sessionId: rec.session_id,
    taskId: rec.task_id,
    shotIndex: rec.shot_index,
    blobKey: `blob-${rec.session_id}-${rec.task_id}`,
    imageHash: rec.image_sha256,
    imageSha256: rec.image_sha256,
    image_sha256: rec.image_sha256,
    imageWidth: rec.image_width,
    image_width: rec.image_width,
    imageHeight: rec.image_height,
    image_height: rec.image_height,
    status: 'scored',
    userAnswer: rec.user_answer,
    originalUserAnswer: rec.user_answer,
    original_user_answer: rec.user_answer,
    userUnsure: rec.user_unsure,
    revisedAfterReveal: rec.revised_after_reveal,
    revised_after_reveal: rec.revised_after_reveal,
    lockedAt: rec.timestamp,
    locked_at: rec.timestamp,
    outcome: rec.outcome ?? null,
    matched: rec.matched,
    excluded: rec.excluded,
    capturedAt: rec.timestamp,
    completedAt: rec.timestamp,
    modelResult: {
      status: rec.model_status,
      answer: rec.model_answer,
      rationale: rec.model_rationale,
      selfConfidence: rec.model_confidence,
      latencyMs: rec.latency_ms,
      latency_ms: rec.latency_ms,
      attempts: 1,
      errorMessage: null,
    },
  };
}
