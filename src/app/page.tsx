'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HeaderBar,
  PrimaryButton,
  SpecimenCard,
  BottomBar,
  ModalDialog,
  ErrorBanner,
  NetworkStatusBadge,
} from '@/components/ui';
import { TASK_DECK } from '@/data/tasks';
import { InstallPrompt } from '@/components/InstallPrompt';
import {
  getActiveSession,
  createSession,
  deleteEverything,
  ensurePersistentStorage,
  FieldSession,
} from '@/lib/storage';
import { loadAuthorSampleSession } from '@/lib/sample-data';

const SAMPLE_SHOT_CARDS = [
  {
    taskId: 'task-specimen-count',
    sceneNum: 1,
    title: 'Specimen Count',
    preview: '/samples/leaves.jpg',
    framing: 'Overhead Flat Lay vs 45° Incline',
    why: 'Tests whether perspective compression degrades counting accuracy.',
  },
  {
    taskId: 'task-tag-number',
    sceneNum: 2,
    title: 'Surveyor Tag Digits',
    preview: '/samples/tag.jpg',
    framing: 'Direct Diffused vs Glare Incline',
    why: 'Tests handwritten digit OCR under high dynamic range glare.',
  },
  {
    taskId: 'task-negative-control',
    sceneNum: 3,
    title: 'Negative Presence',
    preview: '/samples/blank.jpg',
    framing: 'Empty Wall Ambient Framing',
    why: 'Ensures model correctly outputs 0 rather than hallucinating entities.',
  },
];

export default function StartScreen() {
  const router = useRouter();
  const [activeSession, setActiveSession] = useState<FieldSession | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [showMobileModal, setShowMobileModal] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Request persistent storage on initial entry
    ensurePersistentStorage().catch(() => {});

    // Check for ongoing session to resume mid-session reloads
    getActiveSession()
      .then(sess => {
        if (sess) setActiveSession(sess);
      })
      .catch(err => {
        console.warn('Storage check error:', err);
      });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);

  const handleStartWalk = async () => {
    try {
      setErrorMessage(null);
      await createSession();
      router.push('/field');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not initialize session.';
      setErrorMessage(msg);
    }
  };

  const handleLoadAuthorSample = async () => {
    try {
      setIsLoadingSample(true);
      setErrorMessage(null);
      const res = await loadAuthorSampleSession();
      if (res.success) {
        router.push('/results');
      } else {
        setErrorMessage(res.error || 'Could not load sample data.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error loading sample session.');
    } finally {
      setIsLoadingSample(false);
    }
  };

  const handleDeleteAllData = async () => {
    try {
      await deleteEverything();
      setActiveSession(null);
      setShowDeleteModal(false);
      setStatusMessage('All local fieldwork data and photos have been deleted.');
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not delete data.';
      setErrorMessage(msg);
      setShowDeleteModal(false);
    }
  };

  return (
    <main className="w-full min-h-screen flex flex-col justify-between py-2">
      {/* Top Header */}
      <div>
        <HeaderBar
          title="FIELDEVAL"
          rightElement={<NetworkStatusBadge isOnline={isOnline} />}
        />

        {errorMessage && (
          <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />
        )}

        {statusMessage && (
          <div className="w-full p-3 bg-flag-lime border-2 border-black rounded-[4px] mb-3 text-[14px] font-serif text-black">
            {statusMessage}
          </div>
        )}

        <InstallPrompt />

        {/* Hero Section */}
        <section className="mt-6 mb-5">
          <h1 className="font-display font-extrabold text-[40px] sm:text-[44px] leading-[1.05] tracking-[-0.02em] text-black mb-3">
            Call it<br />
            before you<br />
            look.
          </h1>
          <p className="font-serif text-[17px] leading-[1.5] text-black/90 max-w-[340px]">
            Photograph six things outside. Lock what you see. The model answers blind. Then we score it.
          </p>
        </section>

        {/* What We Do & Why We Use It Banner */}
        <section className="mb-5 bg-tyvek border-2 border-black rounded-[4px] p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1 pb-1 border-b border-black/15">
            <span className="font-display font-extrabold text-[12px] uppercase tracking-wider text-ballpoint">
              Why Field Benchmark?
            </span>
            <span className="text-[11px] font-display font-semibold uppercase bg-concrete px-2 py-0.5 rounded border border-black/20 text-black">
              Gemma 4 (31B)
            </span>
          </div>
          <p className="font-serif text-[14px] leading-snug text-black/85 mt-2">
            Vision benchmarks inside clean labs fail on wet leaves and harsh sunlight. FieldEval pairs human ground-truth against open-weight vision models to measure real flip rates across lighting and perspective.
          </p>
        </section>

        {/* Visual Camera Shots Detailing Section */}
        <section className="mb-5">
          <div className="text-[12px] font-display font-bold uppercase tracking-[0.14em] text-ballpoint mb-2.5 flex items-center justify-between">
            <span>Specimen Protocol & Shots</span>
            <span className="text-black/60">Sample Reference</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {SAMPLE_SHOT_CARDS.map(card => (
              <div
                key={card.taskId}
                className="bg-tyvek border-2 border-black rounded-[4px] p-3 flex items-center gap-3 shadow-2xs"
              >
                <div className="w-16 h-16 rounded-[2px] border border-black overflow-hidden shrink-0 bg-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.preview}
                    alt={card.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-display font-extrabold text-[13px] text-black">
                      #{card.sceneNum}
                    </span>
                    <span className="font-display font-bold text-[12px] text-ballpoint truncate">
                      {card.title}
                    </span>
                  </div>
                  <span className="font-serif text-[12px] text-black/75 truncate block">
                    {card.framing}
                  </span>
                  <span className="font-serif text-[11px] text-black/60 italic truncate block">
                    {card.why}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The 6 Scenes Deck Overview */}
        <section className="mb-5">
          <div className="text-[12px] font-display font-bold uppercase tracking-[0.14em] text-ballpoint mb-2 flex items-center justify-between">
            <span>Today&apos;s Deck</span>
            <span className="text-black/60">6 Scenes</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {TASK_DECK.map(task => (
              <div
                key={task.id}
                className="bg-tyvek border-2 border-black rounded-[4px] p-2 flex flex-col justify-between min-h-[68px] shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-[13px] text-black">
                    #{task.sceneNumber}
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full border border-black/60" />
                </div>
                <span className="font-display font-semibold text-[12px] leading-tight text-ballpoint truncate">
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Specimen Info Card: Offline Storage Guarantee */}
        <SpecimenCard className="py-3.5 px-4 bg-tyvek">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-display font-bold uppercase text-ballpoint tracking-wider">
              Offline-First Guarantee
            </span>
          </div>
          <p className="font-serif text-[14px] leading-snug text-black/85">
            Saved on this phone in IndexedDB. Capture works fully offline; only the shot being scored is sent to Gemma 4 when connected.
          </p>
        </SpecimenCard>

        {/* Field guidance rule */}
        <p className="mt-3 text-[13px] text-black/70 italic text-center">
          Take the phone. Put it away between photos.
        </p>
      </div>

      {/* Bottom Pinned Thumb Zone */}
      <BottomBar>
        {activeSession && activeSession.currentSceneIndex > 0 ? (
          <>
            <Link href="/field" className="w-full block">
              <PrimaryButton variant="blue">
                Resume walk (Scene {activeSession.currentSceneIndex + 1} of 6)
              </PrimaryButton>
            </Link>
            <PrimaryButton variant="white" onClick={handleStartWalk}>
              Start new walk
            </PrimaryButton>
          </>
        ) : (
          <PrimaryButton variant="blue" onClick={handleStartWalk}>
            Start the walk
          </PrimaryButton>
        )}

        <PrimaryButton
          variant="white"
          onClick={handleLoadAuthorSample}
          disabled={isLoadingSample}
        >
          {isLoadingSample ? 'Loading author sample...' : "Sample data from the author's field session"}
        </PrimaryButton>

        {/* Open on phone & Delete all data buttons */}
        <div className="flex items-center justify-between pt-1 px-1">
          <button
            type="button"
            onClick={() => setShowMobileModal(true)}
            className="text-[13px] font-display font-bold text-ballpoint underline hover:text-blue-900 text-left"
          >
            📱 Open on phone
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="text-[12px] font-display font-semibold text-black/50 underline hover:text-black text-right"
          >
            Delete all my data
          </button>
        </div>
      </BottomBar>

      {/* Mobile QR & Installation Modal */}
      {showMobileModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-[380px] bg-tyvek border-2 border-black rounded-[4px] p-5 shadow-2xl flex flex-col gap-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-black/15 pb-2">
              <span className="font-display font-extrabold text-[15px] uppercase tracking-wider text-black">
                📱 Use FieldEval on Mobile
              </span>
              <button
                type="button"
                onClick={() => setShowMobileModal(false)}
                className="w-7 h-7 rounded border border-black/30 font-display font-bold text-[14px] flex items-center justify-center hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>

            <p className="font-serif text-[13px] text-black/85 leading-snug">
              Scan with your phone&apos;s camera on the same Wi-Fi network, or enter the address directly in mobile Safari or Chrome:
            </p>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-3 bg-concrete border border-black rounded-[4px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=http%3A%2F%2F192.168.145.28%3A3000"
                alt="QR Code to open FieldEval on mobile"
                className="w-40 h-40 border border-black rounded-[2px] bg-white p-1.5 shadow-2xs"
              />
              <code className="mt-2.5 px-2 py-1 bg-white border border-black/30 rounded text-[13px] font-mono font-bold text-ballpoint select-all">
                http://192.168.145.28:3000
              </code>
            </div>

            {/* Installation Instructions */}
            <div className="text-[12px] font-serif text-black/85 space-y-1.5 bg-neutral-50 p-2.5 rounded border border-black/20">
              <div className="font-display font-bold text-black uppercase text-[11px]">
                Install as Home Screen App:
              </div>
              <div>
                🍎 <span className="font-bold">iOS Safari</span>: Tap Share icon $\rightarrow$ <span className="font-bold">&quot;Add to Home Screen&quot;</span>.
              </div>
              <div>
                🤖 <span className="font-bold">Android Chrome</span>: Tap 3 dots $\rightarrow$ <span className="font-bold">&quot;Install App&quot;</span>.
              </div>
            </div>

            <PrimaryButton
              variant="black"
              onClick={() => setShowMobileModal(false)}
            >
              Close
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ModalDialog
        isOpen={showDeleteModal}
        title="Delete all my data?"
        message="This will immediately remove all local sessions, photos, and observations stored in this phone's IndexedDB. This action cannot be undone."
        confirmLabel="Delete everything"
        cancelLabel="Keep my data"
        variant="danger"
        onConfirm={handleDeleteAllData}
        onCancel={() => setShowDeleteModal(false)}
      />
    </main>
  );
}
