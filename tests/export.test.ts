import { describe, it, expect } from 'vitest';
import { TASK_DECK } from '@/data/tasks';
import { Observation } from '@/lib/schema';
import {
  createExportRecord,
  serializeSessionToJsonl,
  parseJsonlToExportRecords,
  exportRecordToObservation,
} from '@/lib/export';
import { summarize } from '@/lib/eval';
import { ExportRecordSchema } from '@/lib/schema';

describe('Export JSONL & Import Verification (fieldeval.v1)', () => {
  const sessionId = 'a0000000-0000-4000-8000-000000000001';

  // Realistic fixture session observations
  const fixtureObservations: Observation[] = [
    {
      id: 'b0000000-0000-4000-8000-000000000001',
      sessionId,
      taskId: 'task-specimen-count',
      shotIndex: 'A',
      blobKey: 'blob-key-1',
      imageHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageSha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageWidth: 1024,
      imageHeight: 768,
      status: 'scored',
      userAnswer: '4',
      originalUserAnswer: '4',
      userUnsure: false,
      revisedAfterReveal: false,
      lockedAt: '2026-10-10T20:00:00.000Z',
      outcome: 'correct',
      matched: true,
      excluded: false,
      capturedAt: '2026-10-10T19:59:00.000Z',
      completedAt: '2026-10-10T20:00:05.000Z',
      modelResult: {
        status: 'ok',
        answer: '4',
        rationale: 'Observed exactly four clearly defined leaves on specimen.',
        selfConfidence: 0.94,
        latencyMs: 145,
        latency_ms: 145,
        attempts: 1,
        errorMessage: null,
      },
    },
    {
      id: 'b0000000-0000-4000-8000-000000000002',
      sessionId,
      taskId: 'task-tag-number',
      shotIndex: 'A',
      blobKey: 'blob-key-2',
      imageHash: 'b1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageSha256: 'b1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageWidth: 1024,
      imageHeight: 1024,
      status: 'scored',
      userAnswer: '7394',
      originalUserAnswer: '7394',
      userUnsure: false,
      revisedAfterReveal: false,
      lockedAt: '2026-10-10T20:02:00.000Z',
      outcome: 'correct',
      matched: true,
      excluded: false,
      capturedAt: '2026-10-10T20:01:30.000Z',
      completedAt: '2026-10-10T20:02:04.000Z',
      modelResult: {
        status: 'ok',
        answer: '7394',
        rationale: 'Tag stamped digits 7394 visible in high contrast.',
        selfConfidence: 0.98,
        latencyMs: 120,
        latency_ms: 120,
        attempts: 1,
        errorMessage: null,
      },
    },
    {
      id: 'b0000000-0000-4000-8000-000000000003',
      sessionId,
      taskId: 'task-negative-control',
      shotIndex: 'A',
      blobKey: 'blob-key-3',
      imageHash: 'c1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageSha256: 'c1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageWidth: 800,
      imageHeight: 600,
      status: 'scored',
      userAnswer: 'No',
      originalUserAnswer: 'No',
      userUnsure: false,
      revisedAfterReveal: false,
      lockedAt: '2026-10-10T20:04:00.000Z',
      outcome: 'incorrect',
      matched: false,
      excluded: false,
      capturedAt: '2026-10-10T20:03:30.000Z',
      completedAt: '2026-10-10T20:04:03.000Z',
      modelResult: {
        status: 'ok',
        answer: 'Yes',
        rationale: 'Hallucinated a silhouette in the background shadow.',
        selfConfidence: 0.55,
        latencyMs: 190,
        latency_ms: 190,
        attempts: 1,
        errorMessage: null,
      },
    },
    {
      id: 'b0000000-0000-4000-8000-000000000004',
      sessionId,
      taskId: 'task-dominant-substrate',
      shotIndex: 'A',
      blobKey: 'blob-key-4',
      imageHash: 'd1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageSha256: 'd1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageWidth: 1024,
      imageHeight: 768,
      status: 'scored',
      userAnswer: 'Unsure',
      originalUserAnswer: 'Unsure',
      userUnsure: true,
      revisedAfterReveal: false,
      lockedAt: '2026-10-10T20:06:00.000Z',
      outcome: 'excluded_unsure',
      matched: false,
      excluded: true,
      capturedAt: '2026-10-10T20:05:30.000Z',
      completedAt: '2026-10-10T20:06:02.000Z',
      modelResult: {
        status: 'ok',
        answer: 'Soil',
        rationale: 'Dark organic substrate identified.',
        selfConfidence: 0.8,
        latencyMs: 160,
        latency_ms: 160,
        attempts: 1,
        errorMessage: null,
      },
    },
    {
      id: 'b0000000-0000-4000-8000-000000000005',
      sessionId,
      taskId: 'task-flagging-color',
      shotIndex: 'A',
      blobKey: 'blob-key-5',
      imageHash: 'e1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageSha256: 'e1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageWidth: 1024,
      imageHeight: 768,
      status: 'scored',
      userAnswer: 'Orange',
      originalUserAnswer: 'Pink',
      userUnsure: false,
      revisedAfterReveal: true,
      lockedAt: '2026-10-10T20:08:00.000Z',
      outcome: 'excluded_revised',
      matched: false,
      excluded: true,
      capturedAt: '2026-10-10T20:07:30.000Z',
      completedAt: '2026-10-10T20:08:10.000Z',
      modelResult: {
        status: 'ok',
        answer: 'Orange',
        rationale: 'Flagging tape is neon surveyor orange.',
        selfConfidence: 0.91,
        latencyMs: 135,
        latency_ms: 135,
        attempts: 1,
        errorMessage: null,
      },
    },
    {
      id: 'b0000000-0000-4000-8000-000000000006',
      sessionId,
      taskId: 'task-canopy-density',
      shotIndex: 'A',
      blobKey: 'blob-key-6',
      imageHash: 'f1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageSha256: 'f1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      imageWidth: 1024,
      imageHeight: 768,
      status: 'scored',
      userAnswer: 'Dense',
      originalUserAnswer: 'Dense',
      userUnsure: false,
      revisedAfterReveal: false,
      lockedAt: '2026-10-10T20:10:00.000Z',
      outcome: 'excluded_invalid',
      matched: false,
      excluded: true,
      capturedAt: '2026-10-10T20:09:30.000Z',
      completedAt: '2026-10-10T20:10:30.000Z',
      modelResult: {
        status: 'timeout',
        answer: null,
        rationale: null,
        selfConfidence: null,
        latencyMs: 30000,
        latency_ms: 30000,
        attempts: 1,
        errorMessage: 'Provider timed out after 30 seconds.',
      },
    },
  ];

  it('exports valid JSONL records with schema_version fieldeval.v1', () => {
    const exportResult = serializeSessionToJsonl(fixtureObservations, TASK_DECK);
    expect(exportResult.success).toBe(true);
    if (!exportResult.success) return;

    expect(exportResult.count).toBe(6);
    const lines = exportResult.jsonl.trim().split('\n');
    expect(lines.length).toBe(6);

    // Validate each line against ExportRecordSchema
    for (const line of lines) {
      const parsed = JSON.parse(line);
      const validated = ExportRecordSchema.parse(parsed);

      expect(validated.schema_version).toBe('fieldeval.v1');
      expect(validated.session_id).toBe(sessionId);
      expect(typeof validated.observation_id).toBe('string');
      expect(typeof validated.task_id).toBe('string');
      expect(typeof validated.image_sha256).toBe('string');
      expect(validated.image_sha256.length).toBeGreaterThan(0);
      expect(validated.image_width).toBeGreaterThan(0);
      expect(validated.image_height).toBeGreaterThan(0);
      expect(validated.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Model rationale truncated to <= 200 chars
      if (validated.model_rationale) {
        expect(validated.model_rationale.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('truncates model rationale longer than 200 chars', () => {
    const longRationaleObs: Observation = {
      ...fixtureObservations[0],
      id: 'c0000000-0000-4000-8000-000000000001',
      modelResult: {
        status: 'ok',
        answer: '4',
        rationale: 'A'.repeat(350), // 350 chars
        selfConfidence: 0.9,
        latencyMs: 120,
        latency_ms: 120,
        attempts: 1,
        errorMessage: null,
      },
    };

    const record = createExportRecord(longRationaleObs, TASK_DECK);
    expect(record.model_rationale).not.toBeNull();
    expect(record.model_rationale!.length).toBeLessThanOrEqual(200);
    expect(record.model_rationale!.endsWith('...')).toBe(true);
  });

  it('aborts and exports nothing if any record fails Zod validation', () => {
    const invalidObsList: Observation[] = [
      fixtureObservations[0],
      {
        ...fixtureObservations[1],
        id: 'invalid-record-id',
        // Invalidate: set negative latency which violates nonnegative constraint
        modelResult: {
          status: 'ok',
          answer: '7394',
          rationale: 'Valid',
          selfConfidence: 0.9,
          latencyMs: -50,
          latency_ms: -50,
          attempts: 1,
          errorMessage: null,
        },
      },
    ];

    const result = serializeSessionToJsonl(invalidObsList, TASK_DECK);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorRecordId).toBe('invalid-record-id');
      expect(result.error).toContain('latency_ms');
    }
  });

  it('"Import JSONL" check: re-parsing exported JSONL and recomputing summarize() equals original summary', () => {
    // 1. Original summary from in-memory fixture observations
    const originalSummary = summarize(fixtureObservations, TASK_DECK);

    // 2. Export fixture session to JSONL
    const exportResult = serializeSessionToJsonl(fixtureObservations, TASK_DECK);
    expect(exportResult.success).toBe(true);
    if (!exportResult.success) return;

    // 3. Re-parse every line with ExportRecordSchema
    const parsedRecords = parseJsonlToExportRecords(exportResult.jsonl);
    expect(parsedRecords.length).toBe(fixtureObservations.length);

    // 4. Reconstruct observations from parsed ExportRecords
    const reconstructedObs = parsedRecords.map(exportRecordToObservation);

    // 5. Recompute summarize() from the reconstructed observations
    const recomputedSummary = summarize(reconstructedObs, TASK_DECK);

    // 6. Assert that recomputed summary strictly matches original
    expect(recomputedSummary.total).toBe(originalSummary.total);
    expect(recomputedSummary.scorable).toBe(originalSummary.scorable);
    expect(recomputedSummary.correct).toBe(originalSummary.correct);
    expect(recomputedSummary.incorrect).toBe(originalSummary.incorrect);
    expect(recomputedSummary.headlineAccuracy).toBe(originalSummary.headlineAccuracy);
    expect(recomputedSummary.coverage).toBe(originalSummary.coverage);
    expect(recomputedSummary.strictAccuracy).toBe(originalSummary.strictAccuracy);
    expect(recomputedSummary.exclusions).toEqual(originalSummary.exclusions);
    expect(recomputedSummary.wilsonInterval).toEqual(originalSummary.wilsonInterval);
    expect(recomputedSummary.headline).toBe(originalSummary.headline);
    expect(recomputedSummary.perTask).toEqual(originalSummary.perTask);
  });

  it('exported fixture contains NO image bytes, NO GPS coordinates, and NO client device/user-agent fields', () => {
    const exportResult = serializeSessionToJsonl(fixtureObservations, TASK_DECK);
    expect(exportResult.success).toBe(true);
    if (!exportResult.success) return;

    const jsonl = exportResult.jsonl;

    // Check no image data / base64 payloads
    expect(jsonl).not.toContain('data:image');
    expect(jsonl).not.toContain('base64');
    expect(jsonl).not.toContain('imageBytes');
    expect(jsonl).not.toContain('imageBase64');

    // Check no GPS / location coordinates
    expect(jsonl).not.toContain('latitude');
    expect(jsonl).not.toContain('longitude');
    expect(jsonl).not.toContain('altitude');
    expect(jsonl).not.toContain('coords');
    expect(jsonl).not.toContain('gps');

    // Check no device / user-agent data
    expect(jsonl).not.toContain('userAgent');
    expect(jsonl).not.toContain('user_agent');
    expect(jsonl).not.toContain('navigator');
    expect(jsonl).not.toContain('deviceMemory');
    expect(jsonl).not.toContain('hardwareConcurrency');
    expect(jsonl).not.toContain('platform');
  });

  it('exported fixture contains NO API key variable name and NO local file paths', () => {
    const exportResult = serializeSessionToJsonl(fixtureObservations, TASK_DECK);
    expect(exportResult.success).toBe(true);
    if (!exportResult.success) return;

    const jsonl = exportResult.jsonl;

    // Grep for API key variable names
    expect(jsonl).not.toContain('GEMINI_API_KEY');
    expect(jsonl).not.toContain('API_KEY');
    expect(jsonl).not.toContain('AIzaSy');

    // Grep for local file paths
    expect(jsonl).not.toContain('d:/');
    expect(jsonl).not.toContain('D:/');
    expect(jsonl).not.toContain('c:/');
    expect(jsonl).not.toContain('C:/');
    expect(jsonl).not.toContain('d:\\');
    expect(jsonl).not.toContain('c:\\');
    expect(jsonl).not.toContain('file:///');
    expect(jsonl).not.toContain('/spike/');
    expect(jsonl).not.toContain('/samples/');
    expect(jsonl).not.toContain('/projects/');
    expect(jsonl).not.toContain('.jpg');
    expect(jsonl).not.toContain('.png');
  });
});
