import React from 'react';

/**
 * MOCK DATA BADGE
 * Renders prominently on every screen displaying simulated fixture values.
 */
export function MockBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] border border-black/30 bg-tyvek text-ballpoint text-[11px] font-display font-semibold tracking-wider uppercase shadow-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-flag-pink animate-pulse" />
      GEMMA 4 (31B)
    </div>
  );
}

/**
 * NETWORK / OFFLINE STATUS BADGE
 * Makes it crystal clear that capture works offline and the model does not.
 */
export function NetworkStatusBadge({ isOnline }: { isOnline: boolean }) {
  if (isOnline) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] border border-black/30 bg-flag-lime text-black text-[11px] font-display font-bold tracking-wider uppercase shadow-xs">
        <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
        ONLINE • GEMMA READY
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] border border-black bg-flag-pink text-black text-[11px] font-display font-bold tracking-wider uppercase shadow-xs">
      <span className="w-2 h-2 rounded-full bg-black" />
      OFFLINE • CAPTURE ONLY
    </div>
  );
}

/**
 * TOAST NOTIFICATION
 * Informs the user of actions, offline status, or model results.
 */
export function ToastNotification({
  message,
  variant = 'info',
  onDismiss,
}: {
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
  onDismiss?: () => void;
}) {
  const bgColors = {
    info: 'bg-tyvek text-ballpoint border-ballpoint',
    success: 'bg-flag-lime text-black border-black',
    warning: 'bg-yellow-200 text-black border-black',
    error: 'bg-flag-pink text-black border-black',
  }[variant];

  return (
    <div
      role="status"
      className={`w-full p-3 border-2 rounded-[4px] mb-3 flex items-center justify-between gap-2 shadow-sm font-display text-[13px] font-bold ${bgColors} animate-in fade-in slide-in-from-top-2 duration-200`}
    >
      <div className="flex items-center gap-2">
        <span>{variant === 'success' ? '✓' : variant === 'error' ? '⚠' : '●'}</span>
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-black font-extrabold px-1.5 py-0.5 hover:opacity-75"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * HEADER BAR
 * Features the signature punched-hole surveyor ring and uppercase tracked title.
 */
export function HeaderBar({
  title,
  rightElement,
}: {
  title: string;
  rightElement?: React.ReactNode;
}) {
  return (
    <header className="w-full pt-5 pb-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-ballpoint">
        {/* Punched hole tag ring */}
        <div className="w-4 h-4 rounded-full border-2 border-ballpoint flex items-center justify-center shrink-0">
          <div className="w-1 h-1 rounded-full bg-concrete" />
        </div>
        <span className="font-display font-extrabold text-[13px] tracking-[0.16em] uppercase text-black">
          {title}
        </span>
      </div>
      <div>{rightElement || <MockBadge />}</div>
    </header>
  );
}

/**
 * 6-SEGMENT FIELD PROGRESS BAR
 * Shows progress through the 6 field scenes.
 */
export function ProgressBar({
  currentScene,
  totalScenes = 6,
}: {
  currentScene: number;
  totalScenes?: number;
}) {
  return (
    <div className="w-full grid grid-cols-6 gap-1.5 py-1 mb-4">
      {Array.from({ length: totalScenes }).map((_, idx) => {
        const sceneNum = idx + 1;
        const isDone = sceneNum < currentScene;
        const isCurrent = sceneNum === currentScene;

        return (
          <div
            key={idx}
            className={`h-1.5 rounded-full transition-colors ${
              isDone || isCurrent ? 'bg-black' : 'bg-black/15'
            }`}
          />
        );
      })}
    </div>
  );
}

/**
 * SPECIMEN TAG CARD
 * Tyvek white card with 4px radius and top-right punched hole.
 */
export function SpecimenCard({
  children,
  className = '',
  hasPunchedHole = true,
}: {
  children: React.ReactNode;
  className?: string;
  hasPunchedHole?: boolean;
}) {
  return (
    <div
      className={`relative w-full bg-tyvek border-2 border-black rounded-[4px] p-5 shadow-sm text-black ${className}`}
    >
      {hasPunchedHole && (
        <div
          className="absolute top-4 right-4 w-4 h-4 rounded-full border-2 border-black flex items-center justify-center pointer-events-none"
          title="Punched tag hole"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-tyvek" />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * PHOTO PREVIEW CONTAINER
 * Supports rendering a real captured image or the hatched pattern placeholder.
 */
export function PhotoContainer({
  shotLabel = 'Shot A',
  imageUrl,
  children,
  className = '',
}: {
  shotLabel?: string;
  imageUrl?: string | null;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full h-[260px] sm:h-[300px] border-2 border-black rounded-[2px] overflow-hidden flex items-center justify-center ${
        imageUrl ? 'bg-black' : 'bg-hatched'
      } ${className}`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`Captured preview for ${shotLabel}`}
          className="w-full h-full object-cover"
        />
      ) : null}

      {/* Shot indicator tag inside photo container */}
      <div className="absolute bottom-3 left-3 z-10 px-2.5 py-1 bg-tyvek border border-black rounded-[3px] text-[12px] font-display font-bold uppercase tracking-wider text-black shadow-xs">
        {shotLabel}
      </div>

      {children}
    </div>
  );
}

/**
 * FLAGGING TAPE SLAP
 * Slaps diagonally across the photo on reveal (~240ms duration).
 * Respects prefers-reduced-motion by fading instead.
 */
export function FlaggingTape({
  text,
  matched,
  excluded = false,
}: {
  text: string;
  matched: boolean;
  excluded?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none overflow-hidden">
      <div
        className={`w-[125%] py-3 px-6 shadow-md border-y-2 border-black flex items-center justify-center animate-tape-slap ${
          excluded
            ? 'bg-concrete text-black border-dashed'
            : matched
            ? 'bg-flag-lime text-tape-black'
            : 'bg-flag-pink text-tape-black'
        }`}
        style={{
          transformOrigin: 'center center',
        }}
      >
        <span className="font-display font-extrabold text-[22px] tracking-[0.14em] uppercase text-black text-center whitespace-nowrap">
          {text}
        </span>
      </div>
    </div>
  );
}

/**
 * PRIMARY FIELD ACTION BUTTON
 * Guaranteed 56px minimum tap target, 14px radius, one verb per action.
 */
export function PrimaryButton({
  children,
  onClick,
  variant = 'blue',
  disabled = false,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'blue' | 'black' | 'white' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  const variantStyles = {
    blue: 'bg-ballpoint text-tyvek border-2 border-black active:bg-blue-800',
    black: 'bg-black text-tyvek border-2 border-black active:bg-neutral-800',
    white: 'bg-tyvek text-black border-2 border-black active:bg-neutral-100',
    danger: 'bg-flag-pink text-black border-2 border-black active:bg-red-500',
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full min-h-[56px] px-6 py-3.5 rounded-[14px] font-display font-bold text-[18px] tracking-wide flex items-center justify-center transition-transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${variantStyles} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * BOTTOM BAR CONTAINER
 * Pinned above the mobile safe-area inset in the ergonomic thumb zone.
 */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-auto pt-5 pb-2 w-full flex flex-col gap-2.5">
      {children}
    </div>
  );
}

/**
 * MODAL DIALOG
 * Simple confirmation dialog for destructive actions.
 */
export function ModalDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'primary';
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-xs">
      <div className="w-full max-w-[360px] bg-tyvek border-2 border-black rounded-[4px] p-5 shadow-xl text-black animate-in fade-in zoom-in-95 duration-150">
        <h3 className="font-display font-extrabold text-[22px] leading-tight text-black mb-2">
          {title}
        </h3>
        <p className="font-serif text-[15px] leading-normal text-black/85 mb-6">
          {message}
        </p>
        <div className="flex flex-col gap-2">
          <PrimaryButton
            variant={variant === 'danger' ? 'danger' : 'blue'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </PrimaryButton>
          <PrimaryButton variant="white" onClick={onCancel}>
            {cancelLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/**
 * ERROR BANNER
 * Clear inline error notification telling the user what happened and what to do.
 */
export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="w-full p-3.5 bg-flag-pink border-2 border-black rounded-[4px] mb-3 flex items-start justify-between gap-2 shadow-xs">
      <p className="font-serif text-[14px] leading-snug text-black font-medium">
        {message}
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="font-display font-bold text-[14px] px-1 text-black active:opacity-70"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * CAMERA FRAMING INSTRUCTION CARD
 * Explains what shot to take, why we test it, and lighting requirements.
 */
export function CameraFramingGuide({
  shotIndex,
  instruction,
  lighting,
  whyWeTest,
  sampleImage,
}: {
  shotIndex: 'A' | 'B';
  instruction: string;
  lighting: string;
  whyWeTest?: string;
  sampleImage?: string;
}) {
  return (
    <div className="w-full bg-tyvek border-2 border-black rounded-[4px] p-4 mb-4 shadow-xs">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-black/15">
        <span className="font-display font-bold text-[12px] tracking-wider uppercase text-ballpoint">
          Shot {shotIndex} Framing Protocol
        </span>
        <span className="text-[11px] font-display font-semibold uppercase bg-concrete px-2 py-0.5 rounded border border-black/20 text-black">
          {lighting}
        </span>
      </div>

      <p className="font-serif text-[16px] font-semibold text-black leading-snug mb-2">
        {instruction}
      </p>

      {whyWeTest && (
        <p className="font-serif text-[13px] text-black/75 italic leading-relaxed mb-3">
          Why: {whyWeTest}
        </p>
      )}

      {sampleImage && (
        <div className="w-full h-32 rounded-[2px] border border-black overflow-hidden relative mt-2 bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sampleImage}
            alt={`Reference specimen shot for Shot ${shotIndex}`}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-tyvek text-[10px] font-display rounded">
            REFERENCE SHOT
          </div>
        </div>
      )}
    </div>
  );
}
