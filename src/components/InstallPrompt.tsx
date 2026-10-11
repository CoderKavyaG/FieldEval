'use client';

import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    // Check if running in standalone display mode already
    if (typeof window === 'undefined') return;

    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detect iOS
    const isAppleDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isAppleDevice);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  if (isStandalone || dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  return (
    <aside aria-label="Mobile App Installation" className="w-full mb-4 p-3 bg-flag-lime border-2 border-black rounded-[4px] shadow-xs flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[16px]">📱</span>
          <span className="font-display font-extrabold text-[12px] uppercase tracking-wider text-black">
            Install Mobile App
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-black text-[12px] font-bold px-1.5 py-0.5 border border-black rounded hover:bg-black/10"
          aria-label="Dismiss install banner"
        >
          ✕
        </button>
      </div>

      <p className="font-serif text-[13px] leading-tight text-black/90">
        Run FieldEval in fullscreen standalone mode with native camera access.
      </p>

      {deferredPrompt && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full py-2 bg-tape-black text-white font-display font-bold text-[13px] uppercase tracking-wide rounded-[4px] border border-black hover:bg-neutral-800 active:scale-[0.98] transition-transform"
        >
          Add to Home Screen
        </button>
      )}

      {isIOS && (
        <div className="text-[12px] font-serif bg-white/70 border border-black/20 p-2 rounded text-black/85">
          Tap the Safari <span className="font-bold">Share</span> icon (square with arrow) below and select <span className="font-bold">&quot;Add to Home Screen&quot;</span>.
        </div>
      )}
    </aside>
  );
}
