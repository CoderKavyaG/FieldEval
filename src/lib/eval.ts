import type { Observation, TaskDef, ScoreOutcome } from './schema';

export type { ScoreOutcome };

export interface ScoreResult {
  outcome: ScoreOutcome;
  matched: boolean;
  excluded: boolean;
  reason?: string;
}

export type PairClassification = 'both_correct' | 'only_a' | 'only_b' | 'both_wrong';

export interface PairConsistencyResult {
  excluded: boolean;
  exclusionReason?: 'human_answers_differ' | 'unsure' | 'revised' | 'invalid_output' | null;
  flip: boolean;
  classification?: PairClassification;
  shotAScore?: ScoreOutcome;
  shotBScore?: ScoreOutcome;
  shotAModelAnswer?: string | null;
  shotBModelAnswer?: string | null;
  humanAnswer?: string | null;
}

export interface TaskSummaryStats {
  taskId: string;
  title: string;
  sceneNumber: number;
  k: number; // Correct
  n: number; // Scorable
  totalAttempted: number;
  accuracy: number | null;
  display: string; // "2 of 3" if n < 5, "4 of 5 (80%)" if n >= 5
}

export interface VariantSummaryStats {
  variant: 'A' | 'B';
  k: number;
  n: number;
  accuracy: number | null;
  display: string;
}

export interface EvalSummary {
  total: number; // Attempted
  completed: number;
  scorable: number; // Scorable (unsure & revised excluded from denominator)
  correct: number;
  incorrect: number;
  headlineAccuracy: number; // correct / scorable
  coverage: number; // valid / attempted (invalid counted in coverage, not accuracy)
  strictAccuracy: number; // correct / (scorable + invalid)
  flipRate: number; // flips / scorablePairs
  medianLatencyMs: number;
  wilsonInterval: [number, number] | null;
  exclusions: {
    unsure: number;
    revised: number;
    invalid: number;
    total: number;
  };
  perTask: TaskSummaryStats[];
  perVariant: VariantSummaryStats[];
  pairedCount: number;
  flippedPairsCount: number;
  headline: string;
  statsCaption: string;
}

export interface ScoreObservationOptions {
  isUnsure?: boolean;
  revisedAfterReveal?: boolean;
  modelStatus?: string | null;
  taskType?: 'stepper' | 'choice' | 'digits' | string;
  validOptions?: string[];
  originalUserAnswer?: string | null;
}

/**
 * Normalizes numeric string to integer if integer format.
 */
function parseCountOrInteger(value: string): number | null {
  const trimmed = value.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const match = trimmed.match(/\b\d+\b/);
  if (match) {
    return parseInt(match[0], 10);
  }
  return null;
}

/**
 * Checks count match including "12+" rule.
 * - If human is "12+", model answering "12+" or any count >= 12 is correct.
 * - If human is an exact count (e.g. "4"), model must match exact count.
 */
function matchesCountRule(userAnswer: string, modelAnswer: string): boolean {
  const u = userAnswer.trim();
  const m = modelAnswer.trim();

  const isUserTwelvePlus = u === '12+' || u === '>=12' || u.toLowerCase() === '12 or more';
  const isModelTwelvePlus = m === '12+' || m === '>=12' || m.toLowerCase() === '12 or more';

  if (isUserTwelvePlus) {
    if (isModelTwelvePlus) return true;
    const modelNum = parseCountOrInteger(m);
    return modelNum !== null && modelNum >= 12;
  }

  const userNum = parseCountOrInteger(u);
  const modelNum = parseCountOrInteger(m);

  if (userNum !== null && modelNum !== null) {
    if (userNum >= 12 && isModelTwelvePlus) return true;
    return userNum === modelNum;
  }

  return u.toLowerCase() === m.toLowerCase();
}

/**
 * Checks choice match strictly against the allowed task answer set.
 */
function matchesChoiceRule(
  userAnswer: string,
  modelAnswer: string,
  validOptions?: string[]
): boolean {
  const u = userAnswer.trim().toLowerCase();
  const m = modelAnswer.trim().toLowerCase();

  if (u === m) return true;

  if (validOptions && validOptions.length > 0) {
    // Find canonical option matching user and model
    const userCanonical = validOptions.find(opt => opt.toLowerCase() === u);
    const modelCanonical = validOptions.find(opt => {
      const optLower = opt.toLowerCase();
      return m === optLower || m.includes(optLower);
    });

    if (userCanonical && modelCanonical) {
      return userCanonical.toLowerCase() === modelCanonical.toLowerCase();
    }
  }

  return u === m;
}

/**
 * Checks digits-only read match (e.g. surveyor tag 4 digits).
 */
function matchesDigitsRule(userAnswer: string, modelAnswer: string): boolean {
  const uDigits = userAnswer.replace(/\D/g, '');
  const mDigits = modelAnswer.replace(/\D/g, '');

  if (uDigits.length > 0 && mDigits.length > 0) {
    return uDigits === mDigits;
  }

  return userAnswer.trim().toLowerCase() === modelAnswer.trim().toLowerCase();
}

/**
 * Scores an individual observation adhering to eval.v1 rules.
 * Pure function with no I/O.
 * Outcomes: correct | incorrect | excluded_unsure | excluded_revised | excluded_invalid
 */
export function scoreObservation(
  userAnswer: string | null | undefined,
  modelAnswer: string | null | undefined,
  options?: ScoreObservationOptions | boolean
): ScoreResult {
  // Backward compatibility: 3rd param as boolean isUnsure
  const opts: ScoreObservationOptions =
    typeof options === 'boolean' ? { isUnsure: options } : options || {};

  const isUnsure =
    opts.isUnsure === true ||
    (userAnswer && userAnswer.trim().toLowerCase() === 'unsure') ||
    userAnswer === null ||
    userAnswer === undefined ||
    userAnswer.trim() === '';

  // 1. Exclusion Rule: Human Unsure
  if (isUnsure) {
    return {
      outcome: 'excluded_unsure',
      matched: false,
      excluded: true,
      reason: 'Human researcher selected Unsure',
    };
  }

  // 2. Exclusion Rule: Human Revised Answer After Reveal
  if (opts.revisedAfterReveal === true) {
    return {
      outcome: 'excluded_revised',
      matched: false,
      excluded: true,
      reason: 'Human answer was modified after reveal',
    };
  }

  // 3. Exclusion Rule: Invalid Model Output
  const isModelInvalid =
    opts.modelStatus !== undefined &&
    opts.modelStatus !== null &&
    opts.modelStatus !== 'ok';

  if (isModelInvalid || !modelAnswer || !modelAnswer.trim()) {
    return {
      outcome: 'excluded_invalid',
      matched: false,
      excluded: true,
      reason: 'Model output was invalid, timed out, or unparseable',
    };
  }

  const u = userAnswer.trim();
  const m = modelAnswer.trim();

  // 4. Scorable Evaluation: Task-specific matching
  let isCorrect = false;

  if (opts.taskType === 'stepper' || u === '12+' || m === '12+') {
    isCorrect = matchesCountRule(u, m);
  } else if (opts.taskType === 'digits') {
    isCorrect = matchesDigitsRule(u, m);
  } else if (opts.taskType === 'choice') {
    isCorrect = matchesChoiceRule(u, m, opts.validOptions);
  } else {
    // General fallback: digits or count or exact string
    if (u === '12+' || m === '12+') {
      isCorrect = matchesCountRule(u, m);
    } else if (/^\d+$/.test(u) && /\d+/.test(m)) {
      isCorrect = matchesDigitsRule(u, m);
    } else {
      isCorrect = u.toLowerCase() === m.toLowerCase();
    }
  }

  return {
    outcome: isCorrect ? 'correct' : 'incorrect',
    matched: isCorrect,
    excluded: false,
  };
}

/**
 * Computes the asymmetric Wilson score interval with 95% confidence (z = 1.96).
 * Pure function with no I/O.
 * Returns null when n is 0 or invalid.
 */
export function wilson95(k: number, n: number): [number, number] | null {
  if (n <= 0 || k < 0 || k > n) {
    return null;
  }

  const z = 1.959963984540054;
  const z2 = z * z;
  const p = k / n;

  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;

  const lower = Math.max(0, Math.round((center - margin) * 1000) / 1000);
  const upper = Math.min(1, Math.round((center + margin) * 1000) / 1000);

  return [lower, upper];
}

/**
 * Calculates pair consistency between Shot A and Shot B for the same task scene.
 * Pure function with no I/O.
 * - flip = model answers differ between A and B when human answers match
 * - Excludes pairs where the human answers differ (scene changed) or either human was unsure/revised
 */
export function pairConsistency(
  shotA: Observation,
  shotB: Observation,
  taskDefs?: TaskDef[]
): PairConsistencyResult {
  const task = taskDefs?.find(t => t.id === shotA.taskId);
  const taskType = task?.inputType;
  const validOptions = task?.options;

  const scoreA = scoreObservation(shotA.userAnswer, shotA.modelResult?.answer, {
    isUnsure: shotA.userUnsure,
    revisedAfterReveal: shotA.revisedAfterReveal,
    modelStatus: shotA.modelResult?.status,
    taskType,
    validOptions,
  });

  const scoreB = scoreObservation(shotB.userAnswer, shotB.modelResult?.answer, {
    isUnsure: shotB.userUnsure,
    revisedAfterReveal: shotB.revisedAfterReveal,
    modelStatus: shotB.modelResult?.status,
    taskType,
    validOptions,
  });

  // Check human exclusions
  if (scoreA.outcome === 'excluded_unsure' || scoreB.outcome === 'excluded_unsure') {
    return {
      excluded: true,
      exclusionReason: 'unsure',
      flip: false,
      shotAScore: scoreA.outcome,
      shotBScore: scoreB.outcome,
    };
  }

  if (scoreA.outcome === 'excluded_revised' || scoreB.outcome === 'excluded_revised') {
    return {
      excluded: true,
      exclusionReason: 'revised',
      flip: false,
      shotAScore: scoreA.outcome,
      shotBScore: scoreB.outcome,
    };
  }

  const uA = (shotA.userAnswer || '').trim().toLowerCase();
  const uB = (shotB.userAnswer || '').trim().toLowerCase();

  // Exclude pairs where the human answers differ (scene changed / human flip)
  if (uA !== uB) {
    return {
      excluded: true,
      exclusionReason: 'human_answers_differ',
      flip: false,
      shotAScore: scoreA.outcome,
      shotBScore: scoreB.outcome,
      humanAnswer: `${shotA.userAnswer} / ${shotB.userAnswer}`,
    };
  }

  // Model answers
  const mA = (shotA.modelResult?.answer || '').trim();
  const mB = (shotB.modelResult?.answer || '').trim();

  // Check model invalidity
  if (scoreA.outcome === 'excluded_invalid' || scoreB.outcome === 'excluded_invalid') {
    return {
      excluded: true,
      exclusionReason: 'invalid_output',
      flip: false,
      shotAScore: scoreA.outcome,
      shotBScore: scoreB.outcome,
      shotAModelAnswer: mA || null,
      shotBModelAnswer: mB || null,
      humanAnswer: shotA.userAnswer,
    };
  }

  // Flip = model answers differ between A and B when human answers match
  const flip = mA.toLowerCase() !== mB.toLowerCase();

  let classification: PairClassification;
  if (scoreA.outcome === 'correct' && scoreB.outcome === 'correct') {
    classification = 'both_correct';
  } else if (scoreA.outcome === 'correct' && scoreB.outcome === 'incorrect') {
    classification = 'only_a';
  } else if (scoreA.outcome === 'incorrect' && scoreB.outcome === 'correct') {
    classification = 'only_b';
  } else {
    classification = 'both_wrong';
  }

  return {
    excluded: false,
    flip,
    classification,
    shotAScore: scoreA.outcome,
    shotBScore: scoreB.outcome,
    shotAModelAnswer: mA,
    shotBModelAnswer: mB,
    humanAnswer: shotA.userAnswer,
  };
}

/**
 * Aggregates all completed observations into headline statistics.
 * Pure function with no I/O.
 * Generates a deterministic headline sentence without LLMs, refusing comparative claims when n < 5.
 */
export function summarize(
  observations: Observation[],
  taskDefs: TaskDef[] = []
): EvalSummary {
  const total = observations.length;
  let unsureCount = 0;
  let revisedCount = 0;
  let invalidCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;

  const latencies: number[] = [];

  // 1. Score each observation
  const scoredObs = observations.map(obs => {
    const task = taskDefs.find(t => t.id === obs.taskId);
    const score = scoreObservation(obs.userAnswer, obs.modelResult?.answer, {
      isUnsure: obs.userUnsure,
      revisedAfterReveal: obs.revisedAfterReveal,
      modelStatus: obs.modelResult?.status,
      taskType: task?.inputType,
      validOptions: task?.options,
    });

    if (score.outcome === 'excluded_unsure') unsureCount++;
    else if (score.outcome === 'excluded_revised') revisedCount++;
    else if (score.outcome === 'excluded_invalid') invalidCount++;
    else if (score.outcome === 'correct') correctCount++;
    else if (score.outcome === 'incorrect') incorrectCount++;

    if (obs.modelResult?.latencyMs) {
      latencies.push(obs.modelResult.latencyMs);
    }

    return { obs, score };
  });

  const scorable = correctCount + incorrectCount;
  const valid = total - invalidCount;
  const headlineAccuracy = scorable > 0 ? correctCount / scorable : 0;
  const coverage = total > 0 ? valid / total : 0;
  const strictDenominator = scorable + invalidCount;
  const strictAccuracy = strictDenominator > 0 ? correctCount / strictDenominator : 0;

  const wilsonInterval = wilson95(correctCount, scorable);

  // Median Latency
  latencies.sort((a, b) => a - b);
  let medianLatencyMs = 0;
  if (latencies.length > 0) {
    const mid = Math.floor(latencies.length / 2);
    medianLatencyMs =
      latencies.length % 2 === 0
        ? Math.round((latencies[mid - 1] + latencies[mid]) / 2)
        : latencies[mid];
  }

  // 2. Per-task Breakdown
  const tasksToProcess =
    taskDefs.length > 0
      ? taskDefs
      : Array.from(new Set(observations.map(o => o.taskId))).map((id, idx) => ({
          id,
          sceneNumber: idx + 1,
          title: id,
          question: '',
          inputType: 'choice' as const,
          promptVersion: 'p1' as const,
          promptTemplate: '',
          shots: [
            { shotIndex: 'A' as const, instruction: '', lighting: '' },
            { shotIndex: 'B' as const, instruction: '', lighting: '' },
          ] as const,
        }));

  const perTask: TaskSummaryStats[] = tasksToProcess.map(task => {
    const taskObs = scoredObs.filter(item => item.obs.taskId === task.id);
    const k = taskObs.filter(item => item.score.outcome === 'correct').length;
    const n = taskObs.filter(
      item => item.score.outcome === 'correct' || item.score.outcome === 'incorrect'
    ).length;
    const accuracy = n > 0 ? k / n : null;

    // Rule: No percentages under n = 5
    const display = n >= 5 ? `${k} of ${n} (${Math.round((k / n) * 100)}%)` : `${k} of ${n}`;

    return {
      taskId: task.id,
      title: task.title,
      sceneNumber: task.sceneNumber,
      k,
      n,
      totalAttempted: taskObs.length,
      accuracy,
      display,
    };
  });

  // 3. Per-variant Breakdown (Shot A vs Shot B)
  const variants: ('A' | 'B')[] = ['A', 'B'];
  const perVariant: VariantSummaryStats[] = variants.map(variant => {
    const varObs = scoredObs.filter(item => item.obs.shotIndex === variant);
    const k = varObs.filter(item => item.score.outcome === 'correct').length;
    const n = varObs.filter(
      item => item.score.outcome === 'correct' || item.score.outcome === 'incorrect'
    ).length;
    const accuracy = n > 0 ? k / n : null;
    const display = n >= 5 ? `${k} of ${n} (${Math.round((k / n) * 100)}%)` : `${k} of ${n}`;

    return {
      variant,
      k,
      n,
      accuracy,
      display,
    };
  });

  // 4. Paired Analysis & Flip Rate
  const taskIds = Array.from(new Set(observations.map(o => o.taskId)));
  let pairedCount = 0;
  let flippedPairsCount = 0;

  for (const tId of taskIds) {
    const pairA = observations.find(o => o.taskId === tId && o.shotIndex === 'A');
    const pairB = observations.find(o => o.taskId === tId && o.shotIndex === 'B');
    if (pairA && pairB) {
      const consistency = pairConsistency(pairA, pairB, taskDefs);
      if (!consistency.excluded) {
        pairedCount++;
        if (consistency.flip) {
          flippedPairsCount++;
        }
      }
    }
  }

  const flipRate = pairedCount > 0 ? flippedPairsCount / pairedCount : 0;

  // 5. Deterministic Headline Generation
  // Must refuse to make a claim when n < 5 for that slice!
  let headline = '';
  const robustTaskSlices = perTask.filter(t => t.n >= 5 && t.accuracy !== null);

  if (robustTaskSlices.length === 0) {
    // Refuse comparative claim when n < 5
    if (scorable === 0) {
      headline = 'No scorable observations completed in this session.';
    } else {
      headline = `Preliminary walk: ${correctCount} of ${scorable} matched (n < 5 per task; full benchmark requires complete deck).`;
    }
  } else {
    // Slices exist with n >= 5
    const sorted = [...robustTaskSlices].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    if (best.accuracy !== worst.accuracy) {
      headline = `Gemma 4 performed best on ${best.title} (${best.display}) and struggled most on ${worst.title} (${worst.display}).`;
    } else {
      headline = `Gemma 4 achieved consistent ${Math.round((best.accuracy || 0) * 100)}% accuracy across evaluated tasks with n ≥ 5.`;
    }
  }

  const intervalStr = wilsonInterval
    ? `Wilson 95% CI: [${wilsonInterval[0]}, ${wilsonInterval[1]}]`
    : 'Wilson 95% CI: N/A';

  const statsCaption = `${scorable} scorable shots evaluated. Coverage: ${Math.round(
    coverage * 100
  )}% (${valid} valid of ${total} attempted). ${intervalStr}. Flip rate: ${Math.round(
    flipRate * 100
  )}% across ${pairedCount} verified pairs.`;

  return {
    total,
    completed: scoredObs.filter(item => item.obs.status === 'scored').length,
    scorable,
    correct: correctCount,
    incorrect: incorrectCount,
    headlineAccuracy,
    coverage,
    strictAccuracy,
    flipRate,
    medianLatencyMs,
    wilsonInterval,
    exclusions: {
      unsure: unsureCount,
      revised: revisedCount,
      invalid: invalidCount,
      total: unsureCount + revisedCount + invalidCount,
    },
    perTask,
    perVariant,
    pairedCount,
    flippedPairsCount,
    headline,
    statsCaption,
  };
}
