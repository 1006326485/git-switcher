/**
 * Shared SVG icon components for the Git Switcher app.
 * Every icon accepts a `size` prop (default 14) and forwards className.
 * viewBox is always "0 0 16 16" (GitHub Octicons grid).
 */

interface IconProps {
  size?: number;
  className?: string;
}

// ── Clock / History icon (git log) ──────────────────────────────────────────
export function ClockIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z" />
    </svg>
  );
}

// ── Close / X icon ──────────────────────────────────────────────────────────
export function CloseIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.749.749 0 111.06 1.06L9.06 8l3.22 3.22a.749.749 0 11-1.06 1.06L8 9.06l-3.22 3.22a.749.749 0 11-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
    </svg>
  );
}

// ── Branch icon ─────────────────────────────────────────────────────────────
export function BranchIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
    </svg>
  );
}

// ── Terminal icon ───────────────────────────────────────────────────────────
export function TerminalIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M2 2.75A.75.75 0 012.75 2h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H2.75A.75.75 0 012 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h4.5a.75.75 0 010 1.5h-4.5A1.75 1.75 0 011 13.25V2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v4.5a.75.75 0 01-1.5 0V2.75a.25.25 0 00-.25-.25H2.75z" />
    </svg>
  );
}

// ── Finder icon ─────────────────────────────────────────────────────────────
export function FinderIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
    </svg>
  );
}

// ── VSCode icon ─────────────────────────────────────────────────────────────
export function VscodeIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M9.092 1.258a.749.749 0 01.458.683v11.118a.75.75 0 01-1.124.643L3.69 10.5H1.75A1.75 1.75 0 010 8.75v-1.5C0 6.284.784 5.5 1.75 5.5h1.94l4.738-3.259a.749.749 0 01.664-.233zM5.75 6.744l-4.06 2.8a.248.248 0 01-.19.056H1.75a.25.25 0 00-.25.25v1.5c0 .138.112.25.25.25h-.25l3.958 2.73V6.744z" />
    </svg>
  );
}

// ── Kebab / vertical three dots ─────────────────────────────────────────────
export function KebabIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

// ── AI / Sparkle icon (circle with checkmark) ──────────────────────────────
export function AiGenerateIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.28 5.78a.75.75 0 00-1.06-1.06L7 7.94 5.78 6.72a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.75-3.75z" />
    </svg>
  );
}

// ── Chevron right ───────────────────────────────────────────────────────────
export function ChevronRightIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
    </svg>
  );
}

// ── Refresh / Reload icon ───────────────────────────────────────────────────
export function RefreshIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 2.002a1 1 0 011 1v2.5a.5.5 0 01-.5.5H6a.75.75 0 000 1.5h2.5A2 2 0 0010.5 5.5v-2.5a1 1 0 011.707-.707l1.5 1.5a1 1 0 010 1.414l-1.5 1.5a.997.997 0 01-1.414 0 .75.75 0 010-1.06l.44-.442A3.503 3.503 0 005.5 5.5V3.002a1 1 0 011-1h1.5zM12.5 10.5a3.503 3.503 0 01-5.647 2.702l.44-.44a.75.75 0 00-1.06-1.06l-1.5 1.5a1 1 0 000 1.414l1.5 1.5A1 1 0 007 16.002v-2.5a.5.5 0 01.5-.5H10a.75.75 0 000-1.5H7.5A2 2 0 005.5 13.5v2.5a1 1 0 01-1.707.707l-1.5-1.5a1 1 0 010-1.414l1.5-1.5a.997.997 0 011.414 0 .75.75 0 011.06 0 .997.997 0 010 1.414z" />
    </svg>
  );
}

// ── Trash / Delete icon ─────────────────────────────────────────────────────
export function TrashIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM6.5 1.75v1.25h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25zM3.613 5.5l.806 8.873A1.75 1.75 0 006.161 16h3.678a1.75 1.75 0 001.742-1.627L12.387 5.5H3.613z" />
    </svg>
  );
}

// ── Search / Magnifying glass icon ──────────────────────────────────────────
export function SearchIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.749.749 0 01-.326 1.275.749.749 0 01-.734-.215zM11.5 7a4.499 4.499 0 10-8.997 0A4.499 4.499 0 0011.5 7z" />
    </svg>
  );
}

// ── Settings / Gear icon ────────────────────────────────────────────────────
export function SettingsIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0a8.2 8.2 0 01.701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.3.071L12.74 2.8c.653-.188 1.353.049 1.72.607.367.558.292 1.303-.05 1.785l-.816 1.15a.25.25 0 00.013.347c.196.176.421.335.658.473.123.072.172.173.149.287l-.288 1.107a1.277 1.277 0 01-.548.796 1.282 1.282 0 01-.86.216l-1.182-.088a.248.248 0 00-.272.164 9.398 9.398 0 01-.548 1.138.25.25 0 00.067.334l.967.588c.527.322.79.924.636 1.536-.155.612-.665 1.067-1.285 1.154l-1.106.157a.248.248 0 01-.203-.056 9.563 9.563 0 01-.913-.877.25.25 0 00-.36.015l-.588.967c-.322.527-.924.79-1.536.636a1.277 1.277 0 01-1.04-.752l-.157-1.106a.248.248 0 00-.225-.187 9.313 9.313 0 01-1.202-.206.25.25 0 00-.284.148l-.088 1.182a1.277 1.277 0 01-.796.548 1.282 1.282 0 01-.86.216 1.277 1.277 0 01-.886-.503l-.588-.967a.248.248 0 00-.34-.044 9.46 9.46 0 01-1.04.713.25.25 0 00-.093.354l.374.882c.18.427.072.927-.273 1.25a1.277 1.277 0 01-.608.299l-1.106.157a1.282 1.282 0 01-.86-.216 1.277 1.277 0 01-.548-.796l-.288-1.107a.248.248 0 00-.149-.287 9.29 9.29 0 01-.668-.473.25.25 0 00-.323-.019l-.816 1.15c-.342.482-.417 1.227-.05 1.785.367.558 1.067.795 1.72.607l1.182-.232a.248.248 0 01.3.071 9.362 9.362 0 00.668.386c.133.066.194.158.212.224l.288 1.107c.17.645.716 1.195 1.459 1.26A8.004 8.004 0 008 16a8.004 8.004 0 007.861-6.258.248.248 0 01-.027-.119v-.002l-.288-1.107a.248.248 0 00-.212-.224 9.29 9.29 0 01-.668-.386.25.25 0 00-.3.071l-1.182.232c-.653.188-1.353-.049-1.72-.607-.367-.558-.292-1.303.05-1.785l.816-1.15a.25.25 0 00-.013-.347 9.29 9.29 0 01-.658-.473.248.248 0 00-.272-.164l-1.182.088a.248.248 0 00-.203.056 9.563 9.563 0 01-.913.877.25.25 0 01-.36-.015l-.588-.967a1.277 1.277 0 00-1.172-.636z" />
    </svg>
  );
}

// ── Arrow right icon ────────────────────────────────────────────────────────
export function ArrowRightIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M1 8a.75.75 0 01.75-.75h10.69L9.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H1.75A.75.75 0 011 8z" />
    </svg>
  );
}

// ── Plus / Add icon ─────────────────────────────────────────────────────────
export function PlusIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 010 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
    </svg>
  );
}

// ── Folder / Groups icon ────────────────────────────────────────────────────
export function FolderIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-6a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h6V1.5z" />
    </svg>
  );
}

// ── Export / Download icon ──────────────────────────────────────────────────
export function ExportIcon({ size = 14, className }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z" />
      <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z" />
    </svg>
  );
}
