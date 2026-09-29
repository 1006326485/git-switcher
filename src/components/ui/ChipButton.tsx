import { memo } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// ChipButton — tone-driven colored action pill
//
// Replaces the copy-pasted colored pill className blocks across GitOpsToolbar,
// RemoteManager and GitOpsFileList. Tone/size tables are literal strings so
// Tailwind's scanner picks up every utility; adding a tone is a one-line edit.
// ═══════════════════════════════════════════════════════════════════════════

export type ChipTone =
  | "surface"
  | "gray"
  | "blue"
  | "green"
  | "amber"
  | "purple"
  | "red"
  | "cyan"
  | "orange"
  | "indigo"
  | "violet";

export type ChipSize = "md" | "sm" | "xs";

const TONE_CLASS: Record<ChipTone, string> = {
  surface:
    "bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600",
  gray:
    "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600",
  blue:
    "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-900/40",
  green:
    "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/50 hover:bg-green-200 dark:hover:bg-green-900/40",
  amber:
    "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-900/40",
  purple:
    "bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-900/40",
  red:
    "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40",
  cyan:
    "bg-cyan-100 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/50 hover:bg-cyan-200 dark:hover:bg-cyan-900/40",
  orange:
    "bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-900/40",
  indigo:
    "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-200 dark:hover:bg-indigo-900/40",
  violet:
    "bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50 hover:bg-violet-200 dark:hover:bg-violet-900/40",
};

const SIZE_CLASS: Record<ChipSize, string> = {
  md: "px-2.5 py-1.5 rounded-lg text-xs font-medium",
  sm: "px-1.5 py-0.5 rounded-lg",
  xs: "px-2 py-0.5 rounded-lg text-xs font-medium",
};

const CHIP_BASE_CLASS = "disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]";

export interface ChipButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ChipTone;
  size?: ChipSize;
}

export const ChipButton = memo(function ChipButton({
  tone = "surface",
  size = "md",
  className,
  ...rest
}: ChipButtonProps) {
  return (
    <button
      {...rest}
      className={`${SIZE_CLASS[size]} ${TONE_CLASS[tone]} ${CHIP_BASE_CLASS}${className ? ` ${className}` : ""}`}
    />
  );
});
