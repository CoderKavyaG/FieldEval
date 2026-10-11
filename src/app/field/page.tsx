'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HeaderBar,
  ProgressBar,
  SpecimenCard,
  PhotoContainer,
  FlaggingTape,
  PrimaryButton,
  BottomBar,
  MockBadge,
  ModalDialog,
  ErrorBanner,
  NetworkStatusBadge,
  ToastNotification,
  CameraFramingGuide,
} from '@/components/ui';
import { TASK_DECK } from '@/data/tasks';
import type { TaskDef } from '@/lib/schema';
import type { Observation } from '@/lib/schema';
import { prepareImage, PreparedImage } from '@/lib/image';
import {
  getActiveSession,
  createSession,
  updateSessionScene,
  saveObservation,
  savePhotoBlob,
  getPhotoBlob,
  listObservations,
  checkDuplicateHash,
  deleteEverything,
  inferObservation,
  setupOfflineQueueSync,
  FieldSession,
} from '@/lib/storage';

type FieldStage = 'task' | 'capture' | 'reveal';

interface ToastState {
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
}

const SAMPLE_PHOTO_PREVIEWS: Record<string, string> = {
  'task-specimen-count': '/samples/leaves.jpg',
  'task-tag-number': '/samples/tag.jpg',
  'task-negative-control': '/samples/blank.jpg',
  'task-dominant-substrate': '/samples/water.jpg',
  'task-flagging-color': '/samples/tag.jpg',
  'task-canopy-density': '/samples/leaves.jpg',
};

export default function FieldScreen() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Session state
  const [session, setSession] = useState<FieldSession | null>(null);
  const [sceneIndex, setSceneIndex] = useState<number>(0);
  const [stage, setStage] = useState<FieldStage>('task');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Active observation & in-memory photo state
  const [currentObservation, setCurrentObservation] = useState<Observation | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [pendingPreparedImage, setPendingPreparedImage] = useState<PreparedImage | null>(null);

  // User input states
  const [selectedChoice, setSelectedChoice] = useState<string>('');
  const [isUnsure, setIsUnsure] = useState<boolean>(false);
  const [stepperCount, setStepperCount] = useState<number>(4);
  const [digitCode, setDigitCode] = useState<string>('');

  // Human revision after reveal state
  const [isRevising, setIsRevising] = useState<boolean>(false);
  const [revisedChoice, setRevisedChoice] = useState<string>('');
  const [revisedStepper, setRevisedStepper] = useState<number>(4);
  const [revisedDigits, setRevisedDigits] = useState<string>('');
  const [revisedUnsure, setRevisedUnsure] = useState<boolean>(false);

  // UI status and modals
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const [isInferring, setIsInferring] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [showFramingDetails, setShowFramingDetails] = useState<boolean>(false);

  const currentTask: TaskDef = TASK_DECK[sceneIndex] || TASK_DECK[0];

  // 1. Online status and offline sync setup
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      setToast({
        message: 'Connection restored. Background sync running for queued observations.',
        variant: 'info',
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setToast({
        message: 'Offline mode active: Photos will be saved locally in IndexedDB.',
        variant: 'warning',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const cleanupSync = setupOfflineQueueSync(updated => {
      if (currentObservation && updated.id === currentObservation.id) {
        setCurrentObservation(updated);
        setToast({
          message: `Synced observation ${updated.id.slice(0, 8)} with Gemma 4 model.`,
          variant: 'success',
        });
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      cleanupSync();
    };
  }, [currentObservation]);

  // 2. Initialize or resume session
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        let active = await getActiveSession();
        if (!active) {
          active = await createSession();
        }

        if (!isMounted) return;
        setSession(active);
        const savedScene = Math.min(Math.max(0, active.currentSceneIndex), TASK_DECK.length - 1);
        setSceneIndex(savedScene);

        // Check if observation already captured for this scene
        const observations = await listObservations(active.id);
        const existing = observations.find(o => o.taskId === TASK_DECK[savedScene].id);

        if (existing) {
          setCurrentObservation(existing);
          if (existing.blobKey) {
            const blob = await getPhotoBlob(existing.blobKey);
            if (blob && isMounted) {
              setPhotoDataUrl(URL.createObjectURL(blob));
              if (existing.status === 'captured') {
                setStage('capture');
              } else if (existing.status === 'locked' || existing.status === 'scored' || existing.status === 'pending_model') {
                setStage('reveal');
                if (existing.userAnswer) setSelectedChoice(existing.userAnswer);
              }
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not initialize storage session.';
        if (isMounted) setErrorMessage(msg);
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update input defaults when task changes
  useEffect(() => {
    if (currentTask.inputType === 'choice') {
      const defaultOption = currentTask.options?.[0] || 'Yes';
      setSelectedChoice(defaultOption);
    } else if (currentTask.inputType === 'stepper') {
      setStepperCount(4);
    } else if (currentTask.inputType === 'digits') {
      setDigitCode('7394');
    }
    setIsUnsure(false);
  }, [sceneIndex, currentTask]);

  // 3. Camera Trigger via hidden native file input (for manual camera users)
  const handleOpenPicker = () => {
    setErrorMessage(null);
    try {
      fileInputRef.current?.click();
    } catch {
      setErrorMessage('Camera or file picker is unavailable. Please check browser permissions.');
    }
  };

  // Shared file processor: runs normalization, hash check, and IndexedDB storage
  const processFile = async (file: File | Blob) => {
    setIsProcessingImage(true);
    setErrorMessage(null);

    try {
      const prepared = await prepareImage(file);

      // Check for duplicate image hash in this session
      if (session) {
        const isDuplicate = await checkDuplicateHash(session.id, prepared.hash);
        if (isDuplicate) {
          setPendingPreparedImage(prepared);
          setShowDuplicateModal(true);
          setIsProcessingImage(false);
          return;
        }
      }

      await commitCapturedPhoto(prepared);
      setToast({
        message: '📸 Field photo captured & normalized to 1024px JPEG (EXIF scrubbed).',
        variant: 'info',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not process captured photo.';
      setErrorMessage(msg);
    } finally {
      setIsProcessingImage(false);
    }
  };

  // 4. Handle File Selection from native picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      e.target.value = '';
      return;
    }

    const file = files[0];
    e.target.value = '';
    await processFile(file);
  };

  // 5. Test Helper: Load sample photo directly without file dialog
  const handleLoadSamplePhoto = async (samplePathOverride?: string) => {
    setIsProcessingImage(true);
    setErrorMessage(null);
    try {
      const samplePath =
        samplePathOverride ||
        SAMPLE_PHOTO_PREVIEWS[currentTask.id] ||
        '/samples/leaves.jpg';

      const res = await fetch(samplePath);
      if (!res.ok) throw new Error(`Could not load sample field photo: ${samplePath}`);
      const blob = await res.blob();
      await processFile(blob);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not load sample photo.';
      setErrorMessage(msg);
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Drag & drop support
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  // Commit the captured photo into IndexedDB and transition to Capture stage
  const commitCapturedPhoto = async (prepared: PreparedImage) => {
    if (!session) return;

    const blobKey = `blob-${session.id}-${currentTask.id}-${Date.now()}`;

    try {
      await savePhotoBlob(blobKey, prepared.blob, prepared.hash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Device storage full.';
      setErrorMessage(msg);
    }

    const newObs: Observation = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      taskId: currentTask.id,
      shotIndex: 'A',
      blobKey,
      imageHash: prepared.hash,
      imageSha256: prepared.hash,
      image_sha256: prepared.hash,
      imageWidth: prepared.width,
      image_width: prepared.width,
      imageHeight: prepared.height,
      image_height: prepared.height,
      status: 'captured',
      userAnswer: null,
      userUnsure: false,
      matched: null,
      excluded: false,
      capturedAt: new Date().toISOString(),
    };

    try {
      await saveObservation(newObs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Device storage full.';
      setErrorMessage(msg);
    }

    setCurrentObservation(newObs);
    setPhotoDataUrl(prepared.dataUrl);
    setStage('capture');
  };

  // 6. Lock User Ground Truth Answer & Trigger Model Inference
  const handleLockAnswer = async () => {
    if (!session || !currentObservation || isInferring) return;

    let finalAnswer = selectedChoice;
    if (currentTask.inputType === 'stepper') {
      finalAnswer = String(stepperCount);
    } else if (currentTask.inputType === 'digits') {
      finalAnswer = digitCode.trim() || '0000';
    }

    const lockedAnswer = isUnsure ? 'Unsure' : finalAnswer;
    const nowIso = new Date().toISOString();

    const updatedObs: Observation = {
      ...currentObservation,
      status: 'locked',
      userAnswer: lockedAnswer,
      originalUserAnswer: lockedAnswer,
      original_user_answer: lockedAnswer,
      userUnsure: isUnsure,
      lockedAt: nowIso,
      locked_at: nowIso,
      revisedAfterReveal: false,
      revised_after_reveal: false,
      excluded: isUnsure,
      completedAt: nowIso,
    };

    try {
      await saveObservation(updatedObs);
      setCurrentObservation(updatedObs);
      setStage('reveal');
      setIsInferring(true);
      setToast({
        message: '🔒 Ground truth locked. Gemma 4 evaluating photo...',
        variant: 'info',
      });

      // Call the client inferObservation function
      const evaluatedObs = await inferObservation(updatedObs.id);
      if (evaluatedObs) {
        setCurrentObservation(evaluatedObs);
        if (evaluatedObs.status === 'pending_model') {
          setToast({
            message: '📡 Offline: Photo saved locally. Queued for evaluation when connection returns.',
            variant: 'warning',
          });
        } else if (evaluatedObs.modelResult?.status === 'ok') {
          const isMatch = evaluatedObs.matched;
          setToast({
            message: isMatch
              ? `✨ Model matched! Gemma 4 answered "${evaluatedObs.modelResult.answer}" in ${evaluatedObs.modelResult.latencyMs}ms.`
              : `⚠️ Model missed. Gemma 4 answered "${evaluatedObs.modelResult.answer}".`,
            variant: isMatch ? 'success' : 'warning',
          });
        } else if (evaluatedObs.modelResult?.status === 'rate_limited') {
          setToast({
            message: '⏱️ Hourly limit reached (20 req/hr). Kept in storage.',
            variant: 'error',
          });
        } else if (evaluatedObs.modelResult?.status === 'timeout') {
          setToast({
            message: '⏳ Model request timed out after 30 seconds.',
            variant: 'error',
          });
        } else {
          setToast({
            message: evaluatedObs.modelResult?.errorMessage || 'Model evaluation encountered an error.',
            variant: 'error',
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save or infer answer.';
      setErrorMessage(msg);
      setToast({ message: 'Inference request error: ' + msg, variant: 'error' });
    } finally {
      setIsInferring(false);
    }
  };

  // 7. Human Revision after reveal
  const handleStartRevising = () => {
    setIsRevising(true);
    setRevisedChoice(currentObservation?.userAnswer || selectedChoice || '');
    setRevisedStepper(stepperCount);
    setRevisedDigits(digitCode);
    setRevisedUnsure(false);
  };

  const handleConfirmRevision = async () => {
    if (!currentObservation) return;

    let finalRevision = revisedChoice;
    if (currentTask.inputType === 'stepper') {
      finalRevision = String(revisedStepper);
    } else if (currentTask.inputType === 'digits') {
      finalRevision = revisedDigits.trim() || '0000';
    }
    const finalAnswer = revisedUnsure ? 'Unsure' : finalRevision;
    const original = currentObservation.originalUserAnswer || currentObservation.userAnswer || 'Unsure';

    const { scoreObservation } = await import('@/lib/eval');
    const score = scoreObservation(finalAnswer, currentObservation.modelResult?.answer, {
      isUnsure: revisedUnsure,
      revisedAfterReveal: true,
      modelStatus: currentObservation.modelResult?.status,
      taskType: currentTask.inputType,
      validOptions: currentTask.options,
    });

    const updatedObs: Observation = {
      ...currentObservation,
      userAnswer: finalAnswer,
      originalUserAnswer: original,
      original_user_answer: original,
      userUnsure: revisedUnsure,
      revisedAfterReveal: true,
      revised_after_reveal: true,
      outcome: score.outcome,
      matched: score.matched,
      excluded: score.excluded,
    };

    try {
      await saveObservation(updatedObs);
      setCurrentObservation(updatedObs);
      setIsRevising(false);
      setToast({
        message: `Answer revised to "${finalAnswer}". Original answer "${original}" kept; excluded from scoring denominator.`,
        variant: 'warning',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save revision.';
      setErrorMessage(msg);
    }
  };

  // 8. Advance to Next Scene
  const handleNextScene = async () => {
    if (!session || isInferring) return;

    if (sceneIndex < TASK_DECK.length - 1) {
      const nextIndex = sceneIndex + 1;
      setSceneIndex(nextIndex);
      setStage('task');
      setCurrentObservation(null);
      setPhotoDataUrl(null);
      setPendingPreparedImage(null);
      setShowFramingDetails(false);
      setIsRevising(false);
      setToast(null);
      await updateSessionScene(session.id, nextIndex);
    } else {
      router.push('/results');
    }
  };

  // 9. Delete all data confirmation
  const handleDeleteAll = async () => {
    try {
      await deleteEverything();
      setShowDeleteModal(false);
      router.push('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not delete data.';
      setErrorMessage(msg);
    }
  };

  if (isInitializing) {
    return (
      <main className="w-full min-h-screen flex items-center justify-center p-4">
        <div className="font-display font-bold text-[16px] text-ballpoint animate-pulse">
          Loading field session...
        </div>
      </main>
    );
  }

  // Model evaluation state
  const modelResult = currentObservation?.modelResult;
  const isPendingOffline = currentObservation?.status === 'pending_model';
  const userLockedDisplay = currentObservation?.userAnswer || selectedChoice || 'Yes';
  const modelAnswerDisplay = isInferring
    ? 'Evaluating...'
    : isPendingOffline
    ? 'Queued'
    : modelResult?.status === 'ok'
    ? modelResult.answer || '—'
    : modelResult?.status === 'rate_limited'
    ? 'Rate limited'
    : modelResult?.status === 'timeout'
    ? 'Timed out'
    : modelResult?.status === 'invalid_output'
    ? 'Invalid output'
    : modelResult?.status === 'error'
    ? 'Error'
    : 'Evaluating...';

  const isMatch = Boolean(
    currentObservation?.matched &&
      !currentObservation?.userUnsure &&
      !currentObservation?.revisedAfterReveal
  );

  return (
    <main
      className="w-full min-h-screen flex flex-col justify-between py-2"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Hidden Native Camera Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        data-testid="camera-input"
      />

      {/* Top Header & Field Progress */}
      <div>
        <HeaderBar
          title={`SCENE ${currentTask.sceneNumber} OF ${TASK_DECK.length}`}
          rightElement={<NetworkStatusBadge isOnline={isOnline} />}
        />
        <ProgressBar currentScene={currentTask.sceneNumber} totalScenes={TASK_DECK.length} />

        {toast && (
          <ToastNotification
            message={toast.message}
            variant={toast.variant}
            onDismiss={() => setToast(null)}
          />
        )}

        {errorMessage && (
          <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />
        )}

        {/* Offline Explanatory Banner */}
        {!isOnline && (
          <div className="w-full p-2.5 bg-yellow-100 border-2 border-black rounded-[4px] mb-3 text-[13px] font-display text-black flex items-center justify-between">
            <span>📡 OFFLINE: Capture works offline. Model runs when online returns.</span>
          </div>
        )}

        {/* =========================================================================
            PHASE 1: TASK CARD SCREEN
           ========================================================================= */}
        {stage === 'task' && (
          <div className="flex flex-col gap-3 mt-1">
            <SpecimenCard className="py-5 px-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-extrabold text-[13px] tracking-[0.16em] uppercase text-ballpoint">
                    SCENE #{currentTask.sceneNumber} TASK
                  </span>
                  <span className="px-2 py-0.5 bg-concrete text-[11px] font-display font-bold uppercase rounded border border-black/30">
                    Dual-Angle Test
                  </span>
                </div>

                <h1 className="font-display font-extrabold text-[32px] sm:text-[36px] leading-[1.05] tracking-[-0.01em] text-black mb-3">
                  {currentTask.title}
                </h1>

                <p className="font-serif text-[16px] leading-[1.45] text-black/90 mb-4">
                  {currentTask.shots[0].instruction}. {currentTask.shots[0].lighting}.
                </p>

                {/* Framing Protocol Tabs */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2 bg-tyvek border border-black rounded-[4px]">
                    <span className="font-display font-bold text-[11px] uppercase tracking-wider text-black block mb-0.5">
                      Shot A (Active)
                    </span>
                    <span className="font-serif text-[13px] text-black/80 leading-tight block">
                      {currentTask.shots[0].instruction}
                    </span>
                  </div>
                  <div className="p-2 bg-concrete/60 border border-black/40 rounded-[4px]">
                    <span className="font-display font-bold text-[11px] uppercase tracking-wider text-black/60 block mb-0.5">
                      Shot B (Paired)
                    </span>
                    <span className="font-serif text-[13px] text-black/60 leading-tight block">
                      {currentTask.shots[1].instruction}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="w-full border-t-2 border-dashed border-black/25 my-3" />
                <p className="font-serif text-[16px] leading-snug text-black font-medium">
                  <span className="font-bold">Question:</span> {currentTask.question}
                </p>
              </div>
            </SpecimenCard>

            {/* Toggleable Camera Framing Guide with Reference Photography */}
            <div className="w-full">
              <button
                type="button"
                onClick={() => setShowFramingDetails(prev => !prev)}
                className="w-full py-2 px-3 bg-concrete border border-black/30 rounded-[4px] font-display font-bold text-[12px] uppercase tracking-wider text-black flex items-center justify-between"
              >
                <span>{showFramingDetails ? 'Hide Framing Guide' : 'Show Camera Framing Guide & Shots'}</span>
                <span>{showFramingDetails ? '▲' : '▼'}</span>
              </button>

              {showFramingDetails && (
                <div className="mt-2">
                  <CameraFramingGuide
                    shotIndex="A"
                    instruction={currentTask.shots[0].instruction}
                    lighting={currentTask.shots[0].lighting}
                    whyWeTest="Tests whether open-weight models maintain spatial count fidelity under specific ambient illumination and angle changes."
                    sampleImage={SAMPLE_PHOTO_PREVIEWS[currentTask.id]}
                  />
                </div>
              )}
            </div>

            {/* Prominent Quick-Testing Photography Toolbar */}
            <div className="w-full p-3 bg-tyvek border-2 border-black rounded-[4px] shadow-2xs">
              <span className="font-display font-extrabold text-[12px] uppercase tracking-wider text-ballpoint block mb-2">
                🧪 Test With Sample Field Photos (No Camera Needed)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSamplePhoto(SAMPLE_PHOTO_PREVIEWS[currentTask.id])}
                  disabled={isProcessingImage}
                  className="p-2 bg-flag-lime border border-black rounded-[4px] text-[12px] font-display font-bold text-black hover:opacity-90 active:scale-98 text-left truncate"
                >
                  ⚡ Load Task Sample Photo
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSamplePhoto('/samples/leaves.jpg')}
                  disabled={isProcessingImage}
                  className="p-2 bg-tyvek border border-black rounded-[4px] text-[12px] font-display font-bold text-black hover:bg-neutral-100 active:scale-98 text-left truncate"
                >
                  🌿 Specimen Leaves
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSamplePhoto('/samples/tag.jpg')}
                  disabled={isProcessingImage}
                  className="p-2 bg-tyvek border border-black rounded-[4px] text-[12px] font-display font-bold text-black hover:bg-neutral-100 active:scale-98 text-left truncate"
                >
                  🏷️ Surveyor Tag (7394)
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSamplePhoto('/samples/blank.jpg')}
                  disabled={isProcessingImage}
                  className="p-2 bg-tyvek border border-black rounded-[4px] text-[12px] font-display font-bold text-black hover:bg-neutral-100 active:scale-98 text-left truncate"
                >
                  ⬜ Empty Wall (0 People)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            PHASE 2: CAPTURE AND LOCK SCREEN
           ========================================================================= */}
        {stage === 'capture' && (
          <div className="flex flex-col gap-3 mt-1">
            {/* Real Captured Photo Preview */}
            <PhotoContainer shotLabel="Shot A" imageUrl={photoDataUrl} />

            {/* Question Heading */}
            <h2 className="font-display font-extrabold text-[26px] sm:text-[28px] leading-[1.1] tracking-tight text-black mt-1">
              {currentTask.question}
            </h2>

            {/* Answer Controls: Sized for Ergonomic Thumb Zone */}
            {currentTask.inputType === 'choice' && (
              <div className="grid grid-cols-3 gap-2">
                {(currentTask.options || ['Yes', 'No']).map(opt => {
                  const isSelected = selectedChoice === opt && !isUnsure;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setSelectedChoice(opt);
                        setIsUnsure(false);
                      }}
                      className={`min-h-[56px] px-2 py-3 rounded-[14px] font-display font-bold text-[17px] tracking-wide border-2 border-black transition-all active:scale-[0.98] ${
                        isSelected ? 'bg-flag-lime text-black' : 'bg-tyvek text-black'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
                {/* Unsure Tag Button */}
                <button
                  type="button"
                  onClick={() => setIsUnsure(prev => !prev)}
                  className={`min-h-[56px] px-2 py-3 rounded-[14px] font-display font-bold text-[17px] tracking-wide border-2 border-black transition-all active:scale-[0.98] ${
                    isUnsure ? 'bg-black text-white' : 'bg-tyvek text-black'
                  }`}
                >
                  Unsure
                </button>
              </div>
            )}

            {currentTask.inputType === 'stepper' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between bg-tyvek border-2 border-black rounded-[14px] p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStepperCount(prev => Math.max(0, prev - 1));
                      setIsUnsure(false);
                    }}
                    className="w-14 h-14 rounded-[10px] bg-concrete border-2 border-black font-display font-extrabold text-[24px] text-black flex items-center justify-center active:scale-95"
                  >
                    -
                  </button>
                  <div className="flex flex-col items-center">
                    <span className="font-display font-extrabold text-[36px] leading-none text-black">
                      {isUnsure ? '?' : stepperCount}
                    </span>
                    <span className="font-serif text-[13px] text-black/70">count</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStepperCount(prev => prev + 1);
                      setIsUnsure(false);
                    }}
                    className="w-14 h-14 rounded-[10px] bg-flag-lime border-2 border-black font-display font-extrabold text-[24px] text-black flex items-center justify-center active:scale-95"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUnsure(prev => !prev)}
                  className={`min-h-[46px] rounded-[10px] border-2 border-black font-display font-bold text-[15px] ${
                    isUnsure ? 'bg-black text-white' : 'bg-tyvek text-black'
                  }`}
                >
                  {isUnsure ? 'Marked Unsure' : 'Unsure'}
                </button>
              </div>
            )}

            {currentTask.inputType === 'digits' && (
              <div className="flex flex-col gap-2">
                <div className="min-h-[52px] px-4 bg-tyvek border-2 border-black rounded-[14px] flex items-center justify-between font-display font-extrabold text-[30px] tracking-widest text-black">
                  <span>{isUnsure ? 'UNSURE' : digitCode || '----'}</span>
                  <button
                    type="button"
                    onClick={() => setIsUnsure(prev => !prev)}
                    className="text-[13px] font-sans font-bold px-2 py-1 rounded-[4px] border border-black/40"
                  >
                    {isUnsure ? 'Clear' : 'Unsure'}
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {['7', '3', '9', '4', 'Clear'].map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setIsUnsure(false);
                        if (k === 'Clear') setDigitCode('');
                        else setDigitCode(prev => (prev.length < 4 ? prev + k : prev));
                      }}
                      className="min-h-[46px] rounded-[8px] bg-tyvek border border-black font-display font-bold text-[16px] active:bg-neutral-200"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Helper Notice */}
            <p className="font-serif text-[14px] leading-snug text-black/85">
              {isUnsure ? (
                <span>
                  You are locking <span className="font-bold">Unsure</span>. This observation will be excluded from scoring.
                </span>
              ) : (
                <span>
                  You are locking{' '}
                  <span className="font-bold underline">
                    {currentTask.inputType === 'stepper'
                      ? stepperCount
                      : currentTask.inputType === 'digits'
                      ? digitCode || '0'
                      : selectedChoice}
                  </span>
                  . You cannot change it after the model answers.
                </span>
              )}
            </p>
          </div>
        )}

        {/* =========================================================================
            PHASE 3: REVEAL SCREEN (Flagging Tape Slap over Real Photo)
           ========================================================================= */}
        {stage === 'reveal' && (
          <div className="flex flex-col gap-4 mt-1">
            {/* Real Photo with Diagonal Flagging Tape */}
            <PhotoContainer shotLabel="Shot A" imageUrl={photoDataUrl}>
              <FlaggingTape
                text={
                  isInferring
                    ? 'EVALUATING...'
                    : isPendingOffline
                    ? 'QUEUED OFFLINE'
                    : currentObservation?.revisedAfterReveal
                    ? 'EXCLUDED (REVISED)'
                    : currentObservation?.userUnsure
                    ? 'EXCLUDED (UNSURE)'
                    : modelResult?.status === 'rate_limited'
                    ? 'RATE LIMITED'
                    : isMatch
                    ? 'MATCHED'
                    : 'MODEL SAID NO'
                }
                matched={isMatch}
                excluded={Boolean(currentObservation?.revisedAfterReveal || currentObservation?.userUnsure)}
              />
            </PhotoContainer>

            {/* Outcome Headline */}
            <div className="flex items-center justify-between">
              <h2 className="font-display font-extrabold text-[36px] leading-none tracking-tight text-black">
                {isInferring
                  ? 'Evaluating...'
                  : isPendingOffline
                  ? 'Queued.'
                  : currentObservation?.revisedAfterReveal
                  ? 'Revised.'
                  : currentObservation?.userUnsure
                  ? 'Excluded.'
                  : isMatch
                  ? 'Matched.'
                  : 'Mismatch.'}
              </h2>

              {modelResult && (
                <span className="font-display font-bold text-[12px] uppercase tracking-wider text-black/70 bg-concrete px-2 py-1 rounded border border-black/30">
                  {modelResult.latencyMs}ms • {modelResult.attempts || 1} att
                </span>
              )}
            </div>

            {/* Comparison Tags: Real You vs Real Gemma 4 Model */}
            <div className="grid grid-cols-2 gap-3">
              {/* You Locked Card */}
              <div className="p-4 rounded-[4px] border-2 border-black bg-flag-lime flex flex-col justify-between min-h-[96px]">
                <span className="font-display font-bold text-[12px] uppercase tracking-[0.14em] text-black">
                  YOU LOCKED
                </span>
                <span className="font-display font-extrabold text-[28px] leading-tight text-black truncate">
                  {userLockedDisplay}
                </span>
              </div>

              {/* Model Locked Card */}
              <div
                className={`p-4 rounded-[4px] border-2 border-black flex flex-col justify-between min-h-[96px] ${
                  isInferring
                    ? 'bg-neutral-200 animate-pulse'
                    : isPendingOffline
                    ? 'bg-tyvek'
                    : isMatch
                    ? 'bg-flag-lime'
                    : 'bg-flag-pink'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-[12px] uppercase tracking-[0.14em] text-black">
                    GEMMA 4
                  </span>
                  {modelResult?.selfConfidence !== null && modelResult?.selfConfidence !== undefined && (
                    <span className="text-[11px] font-display font-bold text-black/70">
                      {Math.round(modelResult.selfConfidence * 100)}%
                    </span>
                  )}
                </div>
                <span className="font-display font-extrabold text-[28px] leading-tight text-black truncate">
                  {modelAnswerDisplay}
                </span>
              </div>
            </div>

            {/* Revision UI: Revision banner or button */}
            {currentObservation?.revisedAfterReveal ? (
              <div className="p-3 bg-concrete border-2 border-dashed border-black rounded-[4px] text-[13px] font-serif text-black">
                <span className="font-display font-bold uppercase text-[11px] block text-black/70 mb-0.5">
                  Revised Ground Truth
                </span>
                You changed your answer from{' '}
                <span className="font-bold">&quot;{currentObservation.originalUserAnswer}&quot;</span> to{' '}
                <span className="font-bold">&quot;{currentObservation.userAnswer}&quot;</span> after reveal.
                This observation is marked <span className="font-bold">EXCLUDED</span> from accuracy calculations.
              </div>
            ) : !isRevising ? (
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleStartRevising}
                  disabled={isInferring}
                  className="text-[13px] font-display font-semibold text-ballpoint underline hover:text-blue-900"
                >
                  Change my answer after reveal
                </button>
              </div>
            ) : (
              <div className="p-4 bg-tyvek border-2 border-black rounded-[4px] flex flex-col gap-3">
                <div>
                  <span className="font-display font-bold text-[12px] uppercase tracking-wider text-black block">
                    Revise Ground Truth
                  </span>
                  <p className="font-serif text-[13px] text-black/80">
                    Changing your answer now marks this observation as <span className="font-bold">revised</span> and excludes it from scoring.
                  </p>
                </div>

                {currentTask.inputType === 'choice' && (
                  <div className="grid grid-cols-3 gap-2">
                    {(currentTask.options || ['Yes', 'No']).map(opt => {
                      const isSelected = revisedChoice === opt && !revisedUnsure;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setRevisedChoice(opt);
                            setRevisedUnsure(false);
                          }}
                          className={`min-h-[44px] px-2 py-1 rounded-[8px] font-display font-bold text-[15px] border-2 border-black ${
                            isSelected ? 'bg-flag-lime text-black' : 'bg-concrete text-black'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setRevisedUnsure(prev => !prev)}
                      className={`min-h-[44px] px-2 py-1 rounded-[8px] font-display font-bold text-[15px] border-2 border-black ${
                        revisedUnsure ? 'bg-black text-white' : 'bg-concrete text-black'
                      }`}
                    >
                      Unsure
                    </button>
                  </div>
                )}

                {currentTask.inputType === 'stepper' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between bg-concrete border-2 border-black rounded-[8px] p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRevisedStepper(prev => Math.max(0, prev - 1));
                          setRevisedUnsure(false);
                        }}
                        className="w-10 h-10 rounded bg-white border border-black font-display font-extrabold text-[20px]"
                      >
                        -
                      </button>
                      <span className="font-display font-extrabold text-[24px]">
                        {revisedUnsure ? '?' : revisedStepper}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRevisedStepper(prev => prev + 1);
                          setRevisedUnsure(false);
                        }}
                        className="w-10 h-10 rounded bg-white border border-black font-display font-extrabold text-[20px]"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRevisedUnsure(prev => !prev)}
                      className={`min-h-[36px] rounded border border-black font-display font-bold text-[13px] ${
                        revisedUnsure ? 'bg-black text-white' : 'bg-concrete text-black'
                      }`}
                    >
                      {revisedUnsure ? 'Marked Unsure' : 'Unsure'}
                    </button>
                  </div>
                )}

                {currentTask.inputType === 'digits' && (
                  <div className="flex flex-col gap-2">
                    <div className="min-h-[44px] px-3 bg-concrete border-2 border-black rounded-[8px] flex items-center justify-between font-display font-extrabold text-[22px]">
                      <span>{revisedUnsure ? 'UNSURE' : revisedDigits || '----'}</span>
                      <button
                        type="button"
                        onClick={() => setRevisedUnsure(prev => !prev)}
                        className="text-[12px] font-sans font-bold px-2 py-0.5 rounded border border-black/40"
                      >
                        {revisedUnsure ? 'Clear' : 'Unsure'}
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {['7', '3', '9', '4', 'Clear'].map(k => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setRevisedUnsure(false);
                            if (k === 'Clear') setRevisedDigits('');
                            else setRevisedDigits(prev => (prev.length < 4 ? prev + k : prev));
                          }}
                          className="min-h-[38px] rounded bg-white border border-black font-display font-bold text-[14px]"
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleConfirmRevision}
                    className="flex-1 py-2.5 px-3 bg-black text-white rounded-[8px] font-display font-bold text-[14px]"
                  >
                    Confirm revision
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRevising(false)}
                    className="py-2.5 px-3 bg-concrete border border-black rounded-[8px] font-display font-bold text-[14px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Model Rationale / Explanation Card */}
            {modelResult?.rationale && (
              <div className="p-3 bg-tyvek border-2 border-black rounded-[4px]">
                <span className="font-display font-bold text-[11px] uppercase tracking-wider text-ballpoint block mb-1">
                  Model Rationale
                </span>
                <p className="font-serif text-[14px] leading-snug text-black">
                  {modelResult.rationale}
                </p>
              </div>
            )}

            {/* Error or Rate Limit Explanation */}
            {modelResult && modelResult.status !== 'ok' && (
              <div className="p-3 bg-flag-pink/40 border-2 border-black rounded-[4px]">
                <span className="font-display font-bold text-[11px] uppercase tracking-wider text-black block mb-1">
                  Model Status: {modelResult.status}
                </span>
                <p className="font-serif text-[13px] leading-snug text-black">
                  {modelResult.errorMessage || 'Evaluation failed. Observation retained in local IndexedDB.'}
                </p>
              </div>
            )}

            {/* Audit Details */}
            <p className="font-serif text-[13px] leading-snug text-black/80">
              Captured{' '}
              {new Date(currentObservation?.capturedAt || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              . Scored by rule set, not by feel.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Pinned Action Bar */}
      <BottomBar>
        {stage === 'task' && (
          <div className="flex flex-col gap-2">
            <PrimaryButton
              variant="black"
              onClick={handleOpenPicker}
              disabled={isProcessingImage}
            >
              {isProcessingImage ? 'Preparing photo...' : 'Open camera'}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => handleLoadSamplePhoto(SAMPLE_PHOTO_PREVIEWS[currentTask.id])}
              disabled={isProcessingImage}
              className="text-[13px] font-display font-semibold text-ballpoint underline hover:text-blue-900 py-1 text-center"
            >
              Or load default sample photo for #{currentTask.sceneNumber}
            </button>
          </div>
        )}

        {stage === 'capture' && (
          <div className="flex flex-col gap-2">
            <PrimaryButton
              variant="blue"
              onClick={handleLockAnswer}
              disabled={isInferring}
            >
              {isInferring ? 'Locking...' : 'Lock my answer'}
            </PrimaryButton>
            <button
              type="button"
              onClick={handleOpenPicker}
              disabled={isInferring}
              className="text-[13px] font-display font-semibold text-black/70 underline py-1 text-center"
            >
              Retake photo
            </button>
          </div>
        )}

        {stage === 'reveal' && (
          <PrimaryButton
            variant="black"
            onClick={handleNextScene}
            disabled={isInferring}
          >
            {isInferring
              ? 'Model evaluating...'
              : sceneIndex < TASK_DECK.length - 1
              ? 'Next scene'
              : 'View results'}
          </PrimaryButton>
        )}

        {/* Delete all my data shortcut */}
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="text-[12px] font-display font-semibold text-black/50 underline hover:text-black pt-1 text-center"
        >
          Delete all my data
        </button>
      </BottomBar>

      {/* Duplicate Photo Warning Modal */}
      <ModalDialog
        isOpen={showDuplicateModal}
        title="Duplicate photo detected"
        message="You have already used this exact photo for another observation in this session. Do you want to use it anyway?"
        confirmLabel="Use anyway"
        cancelLabel="Choose different photo"
        variant="warning"
        onConfirm={async () => {
          setShowDuplicateModal(false);
          if (pendingPreparedImage) {
            await commitCapturedPhoto(pendingPreparedImage);
            setPendingPreparedImage(null);
          }
        }}
        onCancel={() => {
          setShowDuplicateModal(false);
          setPendingPreparedImage(null);
        }}
      />

      {/* Delete All Data Modal */}
      <ModalDialog
        isOpen={showDeleteModal}
        title="Delete all my data?"
        message="This will immediately remove all local sessions, photos, and observations from this phone's IndexedDB. Are you sure?"
        confirmLabel="Delete everything"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteAll}
        onCancel={() => setShowDeleteModal(false)}
      />
    </main>
  );
}
