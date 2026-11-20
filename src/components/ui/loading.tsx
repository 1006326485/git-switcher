import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

// ═══════════════════════════════════════════════════════════════════════════
// Loading Primitives — the only sanctioned "work in progress" indicators
//
// Before this module every view hand-rolled its own spinner (35 rotating ↻
// glyphs, 7 hard-coded blue rings, 3 copies of the same SVG arc, ~26 plain
// "Loading…" strings). The visual inconsistency was the symptom; the real
// problem was that "loading" had no semantic home, so nothing carried
// aria-busy/role=status and an in-flight refresh was indistinguishable from
// stale data.
//
// Rules of use:
//   * Spinner        — inline/aside a label, or icon-only inside a control.
//   * LoadingState   — a region that is replacing its content (panel/section).
//   * Skeleton*      — first paint only. Refreshes keep the old content and
//                      show a weaker cue (see LoadingBar / refreshing state).
//   * ProgressBar    — programmatic progress (batch ops); omit `value` for
//                      indeterminate work of unknown duration.
//   * useDelayedFlag — gate every one of the above so waits under ~150ms never
//                      flash an indicator, and once shown it stays ≥350ms.
//
// Keyframes and the reduced-motion overrides live in styles/globals.css
// (search for "Loading Primitives").
// ═══════════════════════════════════════════════════════════════════════════

// ── useDelayedFlag ────────────────────────────────────────────────────────

export interface DelayedFlagOptions {
  /** ms of continuous activity before the flag turns on. Default 150. */
  delay?: number;
  /** ms the flag stays on once raised, even if activity ends sooner. Default 350. */
  minDuration?: number;
}

/**
 * Smoothed boolean for loading indicators.
 *
 * Two failure modes this removes:
 *   - the flash: <150ms waits show nothing at all;
 *   - the blink: once raised, the indicator survives `minDuration` so it
 *     never appears for a single frame.
 *
 * Returns `{ visible, pending }` — `pending` is the raw state (useful to lock
 * re-submission immediately while deliberately not painting a spinner yet).
 */
export function useDelayedFlag(active: boolean, options: DelayedFlagOptions = {}) {
  const { delay = 150, minDuration = 350 } = options;
  const [visible, setVisible] = useState(false);
  // Mirrors `visible` so one effect run can decide "still showing" without
  // re-running on its own output (which would race the min-duration timer).
  const visibleRef = useRef(false);
  const raisedAtRef = useRef(0);

  useEffect(() => {
    if (active) {
      if (visibleRef.current) return;
      const timer = setTimeout(() => {
        visibleRef.current = true;
        raisedAtRef.current = Date.now();
        setVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    }

    if (!visibleRef.current) return;
    const remaining = Math.max(0, minDuration - (Date.now() - raisedAtRef.current));
    const timer = setTimeout(() => {
      visibleRef.current = false;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [active, delay, minDuration]);

  return { visible, pending: active };
}

// ── Spinner ───────────────────────────────────────────────────────────────

const SPINNER_SIZE = {
  xs: { box: "h-3 w-3", ring: 2 },
  sm: { box: "h-4 w-4", ring: 2 },
  md: { box: "h-5 w-5", ring: 2 },
  lg: { box: "h-8 w-8", ring: 3 },
} as const;

export type SpinnerSize = keyof typeof SPINNER_SIZE;

export const Spinner = memo(function Spinner({
  size = "sm",
  className = "",
  /** Accessible name. When set, the spinner becomes its own live status. */
  label,
}: {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}) {
  const { box, ring } = SPINNER_SIZE[size];
  const arc = (
    <svg
      className={`loading-spin text-current ${box}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r={10.5} stroke="currentColor" strokeWidth={ring} opacity="0.25" />
      <path
        d="M12 1.5a10.5 10.5 0 0 1 10.5 10.5"
        stroke="currentColor"
        strokeWidth={ring}
        strokeLinecap="round"
      />
    </svg>
  );

  if (!label) {
    return <span className={`inline-flex shrink-0 items-center ${className}`}>{arc}</span>;
  }
  return (
    <span role="status" className={`inline-flex shrink-0 items-center gap-2 ${className}`}>
      {arc}
      <span className="sr-only">{label}</span>
    </span>
  );
});

// ── LoadingState ──────────────────────────────────────────────────────────

/**
 * Region-level "content is coming" placeholder.
 *
 *   variant="inline" — one compact row (a panel header, a list body); the
 *                      label is rendered by default.
 *   variant="block"  — centred block for panels/dialogs with nothing to show.
 *   variant="bare"   — indicator only; caller already explains the context.
 *
 * Always `role="status"` + `aria-live="polite"` + `aria-busy`, with the label
 * as the announced text (so the rotating arc itself stays aria-hidden).
 */
export const LoadingState = memo(function LoadingState({
  label,
  variant = "inline",
  size,
  className = "",
}: {
  label?: string;
  variant?: "inline" | "block" | "bare";
  size?: SpinnerSize;
  className?: string;
}) {
  const { t } = useTranslation();
  const text = label ?? t("common.loading");
  const spinnerSize: SpinnerSize = size ?? (variant === "block" ? "md" : "sm");

  if (variant === "bare") {
    return (
      <span role="status" aria-busy="true" className={`inline-flex items-center ${className}`}>
        <Spinner size={spinnerSize} label={text} />
      </span>
    );
  }

  if (variant === "block") {
    return (
      <div
        role="status"
        aria-busy="true"
        className={`flex flex-col items-center justify-center gap-3 py-10 text-gray-500 dark:text-gray-400 ${className}`}
      >
        <Spinner size={spinnerSize} className="text-[var(--accent)]" />
        <span className="text-sm">{text}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className={`flex items-center gap-2 px-1 py-2 text-xs text-gray-500 dark:text-gray-400 ${className}`}
    >
      <Spinner size={spinnerSize} className="text-[var(--accent)]" />
      <span>{text}</span>
    </div>
  );
});

// ── Skeleton ──────────────────────────────────────────────────────────────

/**
 * A single placeholder bar. Token-driven (`--skeleton`), optionally sweeping a
 * shimmer highlight. `aria-hidden` — skeletons are decorative; announce the
 * wait with LoadingState or `aria-busy` on the container instead.
 */
export const Skeleton = memo(function Skeleton({
  className = "",
  shimmer = true,
  style,
}: {
  className?: string;
  shimmer?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`rounded bg-[var(--skeleton)] ${shimmer ? "skeleton-shimmer" : ""} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
});

/** Container that groups skeleton bars for one card/panel. Pulse lives here only. */
export const SkeletonGroup = memo(function SkeletonGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`animate-pulse ${className}`} aria-hidden="true">
      {children}
    </div>
  );
});

// ── ProgressBar ───────────────────────────────────────────────────────────

/**
 * Determinate progress (`value` + `max`) or an indeterminate sweep.
 * Width transitions on the shared spring curve so batch ticks feel continuous.
 */
export const ProgressBar = memo(function ProgressBar({
  value,
  max,
  label,
  valueText,
  className = "",
}: {
  value?: number;
  max?: number;
  /** Accessible name; optional when surrounding text already names the work. */
  label?: string;
  /** Human-readable progress, announced instead of the raw number. */
  valueText?: string;
  className?: string;
}) {
  const indeterminate = value === undefined || max === undefined || max <= 0;
  const total = max && max > 0 ? max : 0;
  const clamped = indeterminate ? 0 : Math.min(Math.max(value ?? 0, 0), total);
  const percent = indeterminate ? 0 : Math.round((clamped / total) * 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : total}
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-valuetext={indeterminate ? undefined : (valueText ?? `${percent}%`)}
      className={`relative overflow-hidden rounded-full bg-[var(--loading-bar-track)] ${className}`}
      style={{ height: "var(--loading-bar-h)" }}
    >
      <div
        className={`h-full rounded-full bg-[var(--accent)] ${
          indeterminate ? "loading-indeterminate w-1/3" : "transition-[width] duration-300 ease-[var(--ease-spring)]"
        }`}
        style={indeterminate ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
});

/**
 * Top-of-pane hairline that appears while a background refresh is in flight.
 * Reserves no space (absolute, tracks the nearest positioned ancestor), and
 * runs indeterminately because `list_projects` reports no intermediate
 * progress. Pair with `useDelayedFlag` when the caller wants its own gating.
 */
export const LoadingBar = memo(function LoadingBar({
  active,
  label,
  className = "",
}: {
  active: boolean;
  label?: string;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 z-30 ${className}`}>
      <ProgressBar label={label} />
    </div>
  );
});
