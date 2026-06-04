import { useState, useRef, useEffect, useCallback, useId, memo } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

// ═══════════════════════════════════════════════════════════════════════════
// Design System Primitives — single source of truth
// ═══════════════════════════════════════════════════════════════════════════

// ── Segmented Control ─────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; icon: string; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = options.findIndex((o) => o.value === value);
      if (idx < 0) return;
      let next = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        next = (idx + 1) % options.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        next = (idx - 1 + options.length) % options.length;
      } else {
        return;
      }
      e.preventDefault();
      onChange(options[next].value);
    },
    [options, value, onChange]
  );

  return (
    <div
      className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5"
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          role="radio"
          aria-checked={value === opt.value}
          aria-label={opt.label}
          title={opt.label}
          tabIndex={value === opt.value ? 0 : -1}
          className={`px-2 py-1 rounded-md text-sm transition-all ${
            value === opt.value
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

// ── Dropdown Menu ─────────────────────────────────────────────────────────

export const DropdownMenu = memo(function DropdownMenu({
  trigger,
  children,
  align = "right",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: align === "right" ? rect.right - 200 : rect.left,
    });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos]);

  return (
    <div ref={triggerRef}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1.5 min-w-[200px] animate-[fadeIn_0.12s_ease-out]"
          >
            <div onClick={() => setTimeout(() => setOpen(false), 0)}>
              {children}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

// ── Menu Item ─────────────────────────────────────────────────────────────

export const MenuItem = memo(function MenuItem({
  icon,
  label,
  description,
  onClick,
  danger,
}: {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors ${
        danger
          ? "hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
          : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
      }`}
    >
      {icon && (
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className={danger ? "" : "text-gray-900 dark:text-gray-100"}>{label}</div>
        {description && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</div>
        )}
      </div>
    </button>
  );
});

// ── Modal Shell ───────────────────────────────────────────────────────────

export const Modal = memo(function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = "max-w-md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      // Focus trap: keep Tab within the modal
      if (e.key === "Tab" && contentRef.current) {
        const focusable = contentRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    // Focus the first focusable element on open
    const raf = requestAnimationFrame(() => {
      if (contentRef.current) {
        const first = contentRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        first?.focus();
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div
        ref={contentRef}
        className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${maxWidth} mx-4`}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Body */}
        {children}
      </div>
    </div>
  );
});

// ── Tabs (for use inside modals) ──────────────────────────────────────────

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = tabs.findIndex((t) => t.value === active);
      if (idx < 0) return;
      let next = idx;
      if (e.key === "ArrowRight") {
        next = (idx + 1) % tabs.length;
      } else if (e.key === "ArrowLeft") {
        next = (idx - 1 + tabs.length) % tabs.length;
      } else {
        return;
      }
      e.preventDefault();
      onChange(tabs[next].value);
    },
    [tabs, active, onChange]
  );

  return (
    <div role="tablist" className="px-6 flex gap-1 border-b border-gray-200 dark:border-gray-700" onKeyDown={handleKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={active === tab.value}
          tabIndex={active === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            active === tab.value
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Status Badge (unified across all view modes) ──────────────────────────

const STATUS_CONFIG = {
  modified: {
    pill: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300",
    text: "text-yellow-600 dark:text-yellow-400",
    dot: "bg-yellow-500",
    symbol: "M",
  },
  staged: {
    pill: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300",
    text: "text-green-600 dark:text-green-400",
    dot: "bg-green-500",
    symbol: "S",
  },
  untracked: {
    pill: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
    text: "text-gray-600 dark:text-gray-400",
    dot: "bg-gray-400",
    symbol: "U",
  },
  ahead: {
    pill: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300",
    text: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    symbol: "",
  },
  behind: {
    pill: "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300",
    text: "text-purple-600 dark:text-purple-400",
    dot: "bg-purple-500",
    symbol: "",
  },
};

export const StatusBadge = memo(function StatusBadge({
  type,
  count,
  variant = "pill",
}: {
  type: "modified" | "staged" | "untracked" | "ahead" | "behind";
  count: number;
  variant?: "pill" | "text" | "dot" | "compact";
}) {
  if (count === 0) return null;

  const c = STATUS_CONFIG[type];
  const symbol = type === "ahead" ? `↑${count}` : type === "behind" ? `↓${count}` : c.symbol;

  if (variant === "dot") {
    return (
      <span
        className={`w-2 h-2 rounded-full ${c.dot}`}
        title={`${count} ${type}`}
      />
    );
  }

  if (variant === "compact") {
    return (
      <span
        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.pill}`}
        title={`${count} ${type}`}
      >
        {type === "ahead" ? `↑${count}` : type === "behind" ? `↓${count}` : `${count}${c.symbol}`}
      </span>
    );
  }

  if (variant === "text") {
    return (
      <span className={`text-sm font-medium ${c.text}`}>
        {type === "ahead" || type === "behind" ? symbol : count}
      </span>
    );
  }

  // pill (default)
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.pill}`}
    >
      {type === "ahead" || type === "behind"
        ? symbol
        : `${count} ${type === "modified" ? "modified" : type === "staged" ? "staged" : "untracked"}`}
    </span>
  );
});

// ── Group Dot (unified size across all components) ────────────────────────

export const GroupDot = memo(function GroupDot({
  color,
  name,
  size = "sm",
}: {
  color: string | null;
  name: string;
  size?: "xs" | "sm" | "md";
}) {
  const sizeClass = {
    xs: "w-1.5 h-1.5",
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
  }[size];

  return (
    <span
      className={`${sizeClass} rounded-full shrink-0`}
      style={{ backgroundColor: color || "#6B7280" }}
      title={name}
    />
  );
});

// ── Primary Button ────────────────────────────────────────────────────────

export const PrimaryButton = memo(function PrimaryButton({
  children,
  onClick,
  disabled,
  color = "blue",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: "blue" | "green" | "red";
}) {
  const colors = {
    blue: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-blue-600/20",
    green: "bg-green-600 hover:bg-green-700 active:bg-green-800 shadow-green-600/20",
    red: "bg-red-600 hover:bg-red-700 active:bg-red-800 shadow-red-600/20",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-8 px-3 rounded-lg text-white text-sm font-medium transition-all flex items-center gap-1.5 shadow-sm disabled:bg-gray-400 disabled:shadow-none ${colors[color]}`}
    >
      {children}
    </button>
  );
});

// ── Icon Button ───────────────────────────────────────────────────────────

export const IconButton = memo(function IconButton({
  children,
  onClick,
  disabled,
  title,
  hoverColor = "gray",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  hoverColor?: "gray" | "red" | "blue" | "purple";
}) {
  const hover = {
    gray: "hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
    red: "hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20",
    blue: "hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20",
    purple: "hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-md text-gray-400 transition-colors disabled:opacity-50 ${hover[hoverColor]}`}
    >
      {children}
    </button>
  );
});
