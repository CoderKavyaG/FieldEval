import { describe, it, expect } from 'vitest';
import {
  wilson95,
  scoreObservation,
  pairConsistency,
  summarize,
} from '@/lib/eval';
import type { Observation, TaskDef } from '@/lib/schema';

describe('Evaluation & Scoring Rules (eval.v1)', () => {
  describe('Wilson 95% Confidence Interval', () => {
    it('calculates wilson95(7, 10) as about [0.397, 0.892]', () => {
      const interval = wilson95(7, 10);
      expect(interval).not.toBeNull();
      expect(interval![0]).toBeCloseTo(0.397, 3);
      expect(interval![1]).toBeCloseTo(0.892, 3);
      expect(interval).toEqual([0.397, 0.892]);
    });

    it('returns null when n is 0: wilson95(0, 0) is null', () => {
      expect(wilson95(0, 0)).toBeNull();
      expect(wilson95(5, 0)).toBeNull();
      expect(wilson95(0, -1)).toBeNull();
    });
  });

  describe('"12+" Matching Rules', () => {
    it('matches when human locks "12+" and model returns "12+"', () => {
      const res = scoreObservation('12+', '12+', { taskType: 'stepper' });
      expect(res.outcome).toBe('correct');
      expect(res.matched).toBe(true);
      expect(res.excluded).toBe(false);
    });

    it('matches when human locks "12+" and model returns count >= 12 (e.g. 15 or 14 leaves)', () => {
      const res1 = scoreObservation('12+', '15', { taskType: 'stepper' });
      expect(res1.outcome).toBe('correct');
      expect(res1.matched).toBe(true);

      const res2 = scoreObservation('12+', 'There are 18 leaves present', { taskType: 'stepper' });
      expect(res2.outcome).toBe('correct');
      expect(res2.matched).toBe(true);
    });

    it('marks incorrect when human locks "12+" but model answers under 12 (e.g. 4)', () => {
      const res = scoreObservation('12+', '4', { taskType: 'stepper' });
      expect(res.outcome).toBe('incorrect');
      expect(res.matched).toBe(false);
      expect(res.excluded).toBe(false);
    });

    it('marks incorrect when human locks exact count under 12 (e.g. 4) but model answers "12+"', () => {
      const res = scoreObservation('4', '12+', { taskType: 'stepper' });
      expect(res.outcome).toBe('incorrect');
      expect(res.matched).toBe(false);
    });

    it('matches exact count under 12 when model matches', () => {
      const res = scoreObservation('4', '4', { taskType: 'stepper' });
      expect(res.outcome).toBe('correct');
      expect(res.matched).toBe(true);
    });
  });

  describe('Unsure and Revised Exclusions', () => {
    it('excludes unsure observation from accuracy denominator', () => {
      const res1 = scoreObservation('Unsure', '4', { isUnsure: true });
      expect(res1.outcome).toBe('excluded_unsure');
      expect(res1.excluded).toBe(true);

      const obsList: Observation[] = [
        createMockObs({
          taskId: 'task-1',
          userAnswer: '4',
          modelAnswer: '4',
        }),
        createMockObs({
          taskId: 'task-1',
          userAnswer: 'Unsure',
          modelAnswer: '4',
          userUnsure: true,
        }),
      ];

      const summary = summarize(obsList);
      // Denominator (scorable) should be 1, NOT 2
      expect(summary.total).toBe(2);
      expect(summary.scorable).toBe(1);
      expect(summary.correct).toBe(1);
      expect(summary.headlineAccuracy).toBe(1.0);
      expect(summary.exclusions.unsure).toBe(1);
    });

    it('excludes revised observation from accuracy denominator while keeping original', () => {
      const res = scoreObservation('5', '4', { revisedAfterReveal: true });
      expect(res.outcome).toBe('excluded_revised');
      expect(res.excluded).toBe(true);

      const obsList: Observation[] = [
        createMockObs({
          taskId: 'task-1',
          userAnswer: '4',
          modelAnswer: '4',
        }),
        createMockObs({
          taskId: 'task-1',
          userAnswer: '5',
          originalUserAnswer: '4',
          revisedAfterReveal: true,
          modelAnswer: '4',
        }),
      ];

      const summary = summarize(obsList);
      // Denominator (scorable) must exclude revised
      expect(summary.total).toBe(2);
      expect(summary.scorable).toBe(1);
      expect(summary.correct).toBe(1);
      expect(summary.headlineAccuracy).toBe(1.0);
      expect(summary.exclusions.revised).toBe(1);
    });
  });

  describe('Invalid Output in Coverage vs Accuracy', () => {
    it('counts invalid output in coverage not accuracy', () => {
      const obsList: Observation[] = [
        createMockObs({
          taskId: 'task-1',
          userAnswer: 'Gravel',
          modelAnswer: 'Gravel',
          modelStatus: 'ok',
        }),
        createMockObs({
          taskId: 'task-1',
          userAnswer: 'Sand',
          modelAnswer: null,
          modelStatus: 'invalid_output',
        }),
      ];

      const summary = summarize(obsList);
      // Coverage = valid / attempted = 1 / 2 = 50%
      expect(summary.total).toBe(2);
      expect(summary.coverage).toBe(0.5);

      // Scorable is only the valid one: accuracy = 1 of 1 = 100%
      expect(summary.scorable).toBe(1);
      expect(summary.correct).toBe(1);
      expect(summary.headlineAccuracy).toBe(1.0);

      // Strict accuracy includes invalid in denominator: 1 of 2 = 50%
      expect(summary.strictAccuracy).toBe(0.5);
      expect(summary.exclusions.invalid).toBe(1);
    });
  });

  describe('Paired Consistency & Flips', () => {
    it('detects a pair with a flip when human answers match but model flips', () => {
      const shotA = createMockObs({
        taskId: 'task-substrate',
        shotIndex: 'A',
        userAnswer: 'Gravel',
        modelAnswer: 'Gravel',
      });
      const shotB = createMockObs({
        taskId: 'task-substrate',
        shotIndex: 'B',
        userAnswer: 'Gravel',
        modelAnswer: 'Sand',
      });

      const res = pairConsistency(shotA, shotB);
      expect(res.excluded).toBe(false);
      expect(res.flip).toBe(true);
      expect(res.classification).toBe('only_a');
      expect(res.shotAScore).toBe('correct');
      expect(res.shotBScore).toBe('incorrect');
    });

    it('excludes a pair when human answers differ because scene changed', () => {
      const shotA = createMockObs({
        taskId: 'task-substrate',
        shotIndex: 'A',
        userAnswer: 'Gravel',
        modelAnswer: 'Gravel',
      });
      const shotB = createMockObs({
        taskId: 'task-substrate',
        shotIndex: 'B',
        userAnswer: 'Soil', // Human ground truth differs between shots!
        modelAnswer: 'Soil',
      });

      const res = pairConsistency(shotA, shotB);
      expect(res.excluded).toBe(true);
      expect(res.exclusionReason).toBe('human_answers_differ');
      expect(res.flip).toBe(false);
    });
  });

  describe('Sample Size Display Rules (No % Under n=5)', () => {
    const mockTasks: TaskDef[] = [
      {
        id: 'task-1',
        sceneNumber: 1,
        title: 'Specimen Count',
        question: 'Count leaves',
        inputType: 'stepper',
        promptVersion: 'p1',
        promptTemplate: 'Count',
        shots: [
          { shotIndex: 'A', instruction: 'Flat', lighting: 'Sun' },
          { shotIndex: 'B', instruction: '45 deg', lighting: 'Shade' },
        ],
      },
      {
        id: 'task-2',
        sceneNumber: 2,
        title: 'Surveyor Tag Digits',
        question: 'Read digits',
        inputType: 'digits',
        promptVersion: 'p1',
        promptTemplate: 'Digits',
        shots: [
          { shotIndex: 'A', instruction: 'Direct', lighting: 'Sun' },
          { shotIndex: 'B', instruction: 'Tilted', lighting: 'Shade' },
        ],
      },
    ];

    it('shows counts only (no percentages) when n < 5', () => {
      const obsList: Observation[] = [
        createMockObs({ taskId: 'task-1', userAnswer: '4', modelAnswer: '4' }),
        createMockObs({ taskId: 'task-1', userAnswer: '4', modelAnswer: '4' }),
        createMockObs({ taskId: 'task-1', userAnswer: '4', modelAnswer: '3' }),
      ]; // n = 3 scorable for task-1

      const summary = summarize(obsList, mockTasks);
      const t1 = summary.perTask.find(t => t.taskId === 'task-1')!;

      expect(t1.n).toBe(3);
      expect(t1.k).toBe(2);
      expect(t1.display).toBe('2 of 3');
      expect(t1.display).not.toContain('%');

      // Headline must refuse to make comparative claim when n < 5
      expect(summary.headline).toContain('n < 5 per task');
      expect(summary.headline).not.toContain('performed best');
    });

    it('shows percentages and makes claim when n >= 5', () => {
      const obsList: Observation[] = [
        // 5 observations for task-1: 4 correct
        createMockObs({ taskId: 'task-1', userAnswer: '4', modelAnswer: '4' }),
        createMockObs({ taskId: 'task-1', userAnswer: '4', modelAnswer: '4' }),
        createMockObs({ taskId: 'task-1', userAnswer: '4', modelAnswer: '4' }),
        createMockObs({ taskId: 'task-1', userAnswer: '4', modelAnswer: '4' }),
        createMockObs({ taskId: 'task-1', userAnswer: '4', modelAnswer: '3' }),
        // 5 observations for task-2: 1 correct
        createMockObs({ taskId: 'task-2', userAnswer: '7394', modelAnswer: '7394' }),
        createMockObs({ taskId: 'task-2', userAnswer: '7394', modelAnswer: '0000' }),
        createMockObs({ taskId: 'task-2', userAnswer: '7394', modelAnswer: '0000' }),
        createMockObs({ taskId: 'task-2', userAnswer: '7394', modelAnswer: '0000' }),
        createMockObs({ taskId: 'task-2', userAnswer: '7394', modelAnswer: '0000' }),
      ];

      const summary = summarize(obsList, mockTasks);
      const t1 = summary.perTask.find(t => t.taskId === 'task-1')!;
      const t2 = summary.perTask.find(t => t.taskId === 'task-2')!;

      expect(t1.display).toBe('4 of 5 (80%)');
      expect(t2.display).toBe('1 of 5 (20%)');

      // Deterministic headline identifies best and worst slice
      expect(summary.headline).toContain('performed best on Specimen Count (4 of 5 (80%))');
      expect(summary.headline).toContain('struggled most on Surveyor Tag Digits (1 of 5 (20%))');
    });
  });
});

// Helper to construct test Observation objects
function createMockObs(params: {
  taskId: string;
  shotIndex?: 'A' | 'B';
  userAnswer?: string | null;
  originalUserAnswer?: string | null;
  userUnsure?: boolean;
  revisedAfterReveal?: boolean;
  modelAnswer?: string | null;
  modelStatus?: 'ok' | 'invalid_output' | 'timeout' | 'rate_limited' | 'error';
}): Observation {
  return {
    id: crypto.randomUUID(),
    sessionId: '123e4567-e89b-12d3-a456-426614174000',
    taskId: params.taskId,
    shotIndex: params.shotIndex || 'A',
    blobKey: 'mock-blob-key',
    status: 'scored',
    userAnswer: params.userAnswer ?? '4',
    originalUserAnswer: params.originalUserAnswer ?? null,
    userUnsure: params.userUnsure ?? false,
    revisedAfterReveal: params.revisedAfterReveal ?? false,
    capturedAt: new Date().toISOString(),
    excluded: Boolean(params.userUnsure || params.revisedAfterReveal),
    modelResult: {
      status: params.modelStatus ?? 'ok',
      answer: params.modelAnswer ?? '4',
      rationale: 'Mock test rationale',
      selfConfidence: 0.9,
      latencyMs: 150,
      latency_ms: 150,
      attempts: 1,
      errorMessage: null,
    },
  };
}
