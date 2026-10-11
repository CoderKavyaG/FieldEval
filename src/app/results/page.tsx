'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HeaderBar,
  PrimaryButton,
  BottomBar,
  ModalDialog,
  ErrorBanner,
  ToastNotification,
} from '@/components/ui';
import { TASK_DECK } from '@/data/tasks';
import {
  getActiveSession,
  listObservations,
  getPhotoBlob,
  deleteEverything,
  FieldSession,
} from '@/lib/storage';
import { summarize, EvalSummary, TaskSummaryStats } from '@/lib/eval';
import { Observation } from '@/lib/schema';
import { serializeSessionToJsonl } from '@/lib/export';
import { loadAuthorSampleSession } from '@/lib/sample-data';

interface TileData {
  sceneNumber: number;
  taskId: string;
  taskTitle: string;
  status: 'match' | 'miss' | 'excluded' | 'untested';
  label: string;
  userAnswer?: string | null;
  modelAnswer?: string | null;
  thumbnailUrl?: string | null;
  outcome?: string | null;
  isRevised?: boolean;
  isUnsure?: boolean;
}

export default function ResultsScreen() {
  const router = useRouter();
  const [session, setSession] = useState<FieldSession | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const createdObjectUrls: string[] = [];

    async function loadRealData() {
      try {
        const active = await getActiveSession();
        if (!isMounted) return;
        setSession(active || null);

        if (active) {
          const obsList = await listObservations(active.id);
          if (!isMounted) return;
          setObservations(obsList);

          // 1. Run pure evaluation summary adhering to eval.v1 rules
          const evalSummary = summarize(obsList, TASK_DECK);
          setSummary(evalSummary);

          // 2. Load photo thumbnails for all scenes from IndexedDB blobs
          const urlMap: Record<string, string> = {};
          for (const obs of obsList) {
            if (obs.blobKey) {
              const blob = await getPhotoBlob(obs.blobKey);
              if (blob && isMounted) {
                const url = URL.createObjectURL(blob);
                createdObjectUrls.push(url);
                urlMap[obs.taskId] = url;
              }
            }
          }
          if (!isMounted) return;
          setThumbnailUrls(urlMap);

          // 3. Build 6-scene Wall of tiles
          const tileList: TileData[] = TASK_DECK.map(task => {
            const obs = obsList.find(o => o.taskId === task.id);
            if (!obs) {
              return {
                sceneNumber: task.sceneNumber,
                taskId: task.id,
                taskTitle: task.title,
                status: 'untested',
                label: 'Untested',
                thumbnailUrl: null,
              };
            }

            const isExcluded =
              obs.userUnsure ||
              obs.revisedAfterReveal ||
              obs.outcome === 'excluded_unsure' ||
              obs.outcome === 'excluded_revised' ||
              obs.outcome === 'excluded_invalid';

            if (isExcluded) {
              const label = obs.revisedAfterReveal
                ? 'Revised'
                : obs.userUnsure
                ? 'Unsure'
                : 'Excluded';
              return {
                sceneNumber: task.sceneNumber,
                taskId: task.id,
                taskTitle: task.title,
                status: 'excluded',
                label,
                userAnswer: obs.userAnswer,
                modelAnswer: obs.modelResult?.answer,
                thumbnailUrl: urlMap[task.id] || null,
                outcome: obs.outcome,
                isRevised: obs.revisedAfterReveal,
                isUnsure: obs.userUnsure,
              };
            }

            const isMatched = obs.matched && obs.outcome === 'correct';
            return {
              sceneNumber: task.sceneNumber,
              taskId: task.id,
              taskTitle: task.title,
              status: isMatched ? 'match' : 'miss',
              label: isMatched ? 'Matched' : 'Missed',
              userAnswer: obs.userAnswer,
              modelAnswer: obs.modelResult?.answer,
              thumbnailUrl: urlMap[task.id] || null,
              outcome: obs.outcome,
            };
          });

          setTiles(tileList);
        } else {
          // No active session: compute empty summary
          const emptySummary = summarize([], TASK_DECK);
          setSummary(emptySummary);
          setTiles(
            TASK_DECK.map(t => ({
              sceneNumber: t.sceneNumber,
              taskId: t.id,
              taskTitle: t.title,
              status: 'untested',
              label: 'Untested',
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load real session data for results:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadRealData();

    return () => {
      isMounted = false;
      createdObjectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Export results to strict JSONL file conforming to ExportRecordSchema (fieldeval.v1)
  const handleExport = async () => {
    setExportError(null);
    setExportSuccessMessage(null);

    if (observations.length === 0) {
      setExportError('No observations in this session to export.');
      return;
    }

    // Validate every record with Zod schema before writing. If any record fails, show which one and export nothing.
    const result = serializeSessionToJsonl(observations, TASK_DECK);
    if (!result.success) {
      setExportError(result.error);
      return;
    }

    const fileName = `fieldeval-${session?.id?.slice(0, 8) || 'session'}.jsonl`;
    const mimeType = 'application/x-jsonlines';

    // 1. Offer navigator.share({ files }) when supported (tested on mobile browsers)
    try {
      const file = new File([result.jsonl], fileName, { type: mimeType });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({
          files: [file],
          title: 'FieldEval Benchmark Results',
          text: `FieldEval session benchmark export (${result.count} records)`,
        });
        setExportSuccessMessage(`Shared ${fileName} via system share sheet.`);
        return;
      }
    } catch (shareErr: unknown) {
      if (shareErr instanceof Error && shareErr.name === 'AbortError') {
        // User dismissed the share dialog
        return;
      }
      console.warn('Web Share API error, using Blob download fallback:', shareErr);
    }

    // 2. Blob download with anchor tag and download attribute
    try {
      const blob = new Blob([result.jsonl], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccessMessage(`Downloaded ${fileName} (${result.count} records).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not generate download.';
      setExportError(`Download error: ${msg}`);
    }
  };

  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);

  const handleLoadAuthorSample = async () => {
    try {
      setIsLoadingSample(true);
      setExportError(null);
      const res = await loadAuthorSampleSession();
      if (res.success) {
        window.location.reload();
      } else {
        setExportError(res.error || 'Could not load sample data.');
      }
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Error loading sample data.');
    } finally {
      setIsLoadingSample(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteEverything();
      setShowDeleteModal(false);
      router.push('/');
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (isLoading) {
    return (
      <main className="w-full min-h-screen flex items-center justify-center p-4">
        <div className="font-display font-bold text-[16px] text-ballpoint animate-pulse">
          Computing evaluation statistics from field observations...
        </div>
      </main>
    );
  }

  const headline = summary?.headline || 'No scorable observations completed in this session.';
  const scorableCount = summary?.scorable ?? 0;
  const correctCount = summary?.correct ?? 0;
  const wilson = summary?.wilsonInterval;
  const wilsonDisplay = wilson ? `[${wilson[0]}, ${wilson[1]}]` : 'null (n = 0)';
  const flipRateDisplay =
    summary && summary.pairedCount > 0
      ? `${Math.round(summary.flipRate * 100)}% (${summary.flippedPairsCount} of ${summary.pairedCount} pairs)`
      : '0% (0 pairs)';

  return (
    <main className="w-full min-h-screen flex flex-col justify-between py-2">
      <div>
        {/* Header Bar */}
        <HeaderBar
          title="WALK COMPLETE"
          rightElement={
            <span className="font-display font-bold text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-black text-white">
              EVAL.V1
            </span>
          }
        />

        {exportError && (
          <div className="mt-2">
            <ErrorBanner
              message={exportError}
              onDismiss={() => setExportError(null)}
            />
          </div>
        )}

        {exportSuccessMessage && (
          <div className="mt-2">
            <ToastNotification
              message={exportSuccessMessage}
              variant="success"
              onDismiss={() => setExportSuccessMessage(null)}
            />
          </div>
        )}

        {/* Deterministic Headline: never generated by an LLM, refuses claims when n < 5 */}
        <section className="mt-4 mb-5">
          <h1 className="font-display font-extrabold text-[28px] sm:text-[34px] leading-[1.08] tracking-tight text-black">
            {headline}
          </h1>
        </section>

        {/* The Wall of 6 Tiles: lime matched, pink missed, hatched excluded, with stored thumbnails */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display font-bold text-[12px] uppercase tracking-[0.14em] text-ballpoint">
              THE WALL — 6 SCENE TILES
            </span>
            <span className="font-serif text-[12px] text-black/70">
              {correctCount} matched • {scorableCount - correctCount} missed • {summary?.exclusions.total || 0} excluded
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map(tile => {
              const isMatch = tile.status === 'match';
              const isMiss = tile.status === 'miss';
              const isExcluded = tile.status === 'excluded' || tile.status === 'untested';

              return (
                <div
                  key={tile.sceneNumber}
                  className={`relative h-[104px] sm:h-[116px] border-2 border-black rounded-[4px] p-2 flex flex-col justify-between overflow-hidden shadow-2xs ${
                    isMatch
                      ? 'bg-flag-lime'
                      : isMiss
                      ? 'bg-flag-pink'
                      : 'bg-hatched-white'
                  }`}
                >
                  {/* Stored Photo Blob Thumbnail as Background Accent */}
                  {tile.thumbnailUrl && (
                    <div className="absolute top-1.5 right-1.5 z-0 w-10 h-10 rounded-[2px] border border-black overflow-hidden bg-black shrink-0 shadow-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tile.thumbnailUrl}
                        alt={`Scene ${tile.sceneNumber} captured thumbnail`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Scene Number Header */}
                  <div className="z-10 flex items-start justify-between">
                    <span className="font-display font-extrabold text-[20px] leading-none text-black">
                      #{tile.sceneNumber}
                    </span>
                  </div>

                  {/* Tile Bottom: Task Title and Outcome Pill Tag */}
                  <div className="z-10 flex flex-col gap-1">
                    <span className="font-display font-bold text-[10px] uppercase tracking-wide text-black/80 truncate max-w-[85%]">
                      {tile.taskTitle}
                    </span>
                    <div className="flex items-center">
                      <span
                        className={`px-2 py-0.5 border border-black rounded-[3px] font-display font-bold text-[11px] tracking-wide shadow-2xs ${
                          isExcluded
                            ? 'bg-concrete text-black'
                            : 'bg-tyvek text-black'
                        }`}
                      >
                        {tile.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Per-Task Counts Breakdown: strictly k of n, no percentages when n < 5 */}
        <section className="bg-tyvek border-2 border-black rounded-[4px] p-3.5 mb-4">
          <span className="font-display font-bold text-[12px] uppercase tracking-[0.14em] text-ballpoint block mb-2">
            TASK-BY-TASK BENCHMARK (K OF N)
          </span>

          <div className="divide-y divide-black/10">
            {summary?.perTask.map((taskStat: TaskSummaryStats) => (
              <div
                key={taskStat.taskId}
                className="py-2 flex items-center justify-between text-[14px]"
              >
                <div className="flex flex-col pr-2">
                  <span className="font-display font-bold text-black leading-tight">
                    #{taskStat.sceneNumber} {taskStat.title}
                  </span>
                  <span className="font-serif text-[12px] text-black/60">
                    {taskStat.n} scorable {taskStat.n === 1 ? 'shot' : 'shots'} • {taskStat.totalAttempted} attempted
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-display font-extrabold text-[15px] text-black">
                    {taskStat.display}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Statistical Metrics: Flip Rate, Wilson Interval in small type */}
        <section className="bg-tyvek/90 border border-black/40 rounded-[4px] p-3.5 mb-3">
          <div className="grid grid-cols-2 gap-3 mb-2.5">
            <div>
              <span className="font-display font-bold text-[11px] uppercase tracking-wider text-black/70 block mb-0.5">
                Flip Rate (Paired Invariance)
              </span>
              <span className="font-display font-extrabold text-[18px] text-black leading-tight">
                {flipRateDisplay}
              </span>
            </div>

            <div>
              <span className="font-display font-bold text-[11px] uppercase tracking-wider text-black/70 block mb-0.5">
                Benchmark Coverage
              </span>
              <span className="font-display font-extrabold text-[18px] text-black leading-tight">
                {summary ? `${Math.round(summary.coverage * 100)}%` : '0%'}
              </span>
            </div>
          </div>

          {/* Wilson 95% Confidence Interval in small type */}
          <div className="pt-2 border-t border-black/15 flex items-center justify-between">
            <span className="font-display font-bold text-[12px] text-black/80">
              Wilson 95% Confidence Interval:
            </span>
            <span className="font-mono text-[12px] font-bold text-ballpoint">
              {wilsonDisplay}
            </span>
          </div>

          {/* Exclusions Breakdown */}
          {summary && summary.exclusions.total > 0 && (
            <div className="pt-2 mt-2 border-t border-black/10 text-[12px] font-serif text-black/75">
              Exclusions: {summary.exclusions.unsure} unsure, {summary.exclusions.revised} revised after reveal, {summary.exclusions.invalid} invalid model output.
            </div>
          )}
        </section>

        {/* ALWAYS-VISIBLE CAUTION LINE ABOUT SMALL SAMPLES */}
        <div className="p-3 bg-concrete border-l-4 border-ballpoint rounded-[2px] mb-6">
          <p className="font-serif text-[13px] leading-snug text-black/90">
            <span className="font-bold">Small sample caution:</span> Statistical intervals are wide with small samples (N &lt; 30). Use paired consistency to detect angle and lighting sensitivity without overfitting.
          </p>
        </div>
      </div>

      {/* Bottom Pinned Action Bar */}
      <BottomBar>
        <PrimaryButton variant="blue" onClick={handleExport}>
          Export results file (.jsonl)
        </PrimaryButton>

        <PrimaryButton
          variant="white"
          onClick={handleLoadAuthorSample}
          disabled={isLoadingSample}
        >
          {isLoadingSample ? 'Loading author sample...' : "Sample data from the author's field session"}
        </PrimaryButton>

        <Link href="/" className="w-full block">
          <PrimaryButton variant="white">
            Walk again
          </PrimaryButton>
        </Link>

        {/* Delete all data option */}
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="text-[12px] font-display font-semibold text-black/50 underline hover:text-black pt-1 text-center"
        >
          Delete all my data
        </button>
      </BottomBar>

      {/* Delete Confirmation Modal */}
      <ModalDialog
        isOpen={showDeleteModal}
        title="Delete all my data?"
        message="This will immediately remove all local sessions, photos, and observations stored in this phone's IndexedDB. Are you sure?"
        confirmLabel="Delete everything"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteAll}
        onCancel={() => setShowDeleteModal(false)}
      />
    </main>
  );
}
