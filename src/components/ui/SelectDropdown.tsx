import { useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useDropdownPortal } from "../../hooks/useDropdownPortal";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  hint?: string;
  hintStyle?: "badge" | "text";
}

interface SelectDropdownProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  size?: "md" | "sm";
}

export const SelectDropdown = memo(function SelectDropdown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled,
  className,
  ariaLabel,
  size = "md",
}: SelectDropdownProps) {
  const {
    open, search, setSearch, activeIndex, setActiveIndex,
    pos, triggerRef, inputRef, listRef, portalRef,
    close, toggle, handleKeyDown,
  } = useDropdownPortal({ minWidth: 260 });

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  const selectOption = useCallback(
    (index: number) => {
      const opt = filtered[index];
      if (opt && !opt.disabled) {
        onChange(opt.value);
        close();
      }
    },
    [filtered, onChange, close]
  );

  const handleToggle = useCallback(() => {
    if (!disabled) toggle();
  }, [disabled, toggle]);

  return (
    <div ref={triggerRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={
          size === "sm"
            ? "flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--surface-2)] text-xs text-gray-600 dark:text-gray-300 w-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            : "flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        }
      >
        <span
          className={`truncate flex-1 text-left ${selectedLabel || size === "sm" ? "" : "text-gray-400"}`}
        >
          {selectedLabel || placeholder}
        </span>
        <span className="text-gray-400 shrink-0">&#x25BE;</span>
      </button>

      {open && createPortal(
        <div
          ref={portalRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="max-h-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden"
        >
          {options.length > 5 && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, selectOption, filtered.length)}
                placeholder="Search..."
                aria-label="Search options"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div ref={listRef} role="listbox" aria-label="Options" className="overflow-y-auto max-h-65">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                No options found
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isActive = i === activeIndex;
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    data-index={i}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => selectOption(i)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 overflow-hidden transition-colors disabled:opacity-40 ${
                      isActive ? "bg-blue-100 dark:bg-blue-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-700"
                    } ${isSelected ? "text-blue-700 dark:text-blue-300 font-medium" : ""}`}
                  >
                    {isSelected && <span className="text-blue-500 shrink-0">&#x2713;</span>}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {opt.hint &&
                      (opt.hintStyle === "text" ? (
                        <span className="shrink min-w-0 max-w-[55%] truncate text-[10px] text-gray-400 dark:text-gray-500">
                          {opt.hint}
                        </span>
                      ) : (
                        <span
                          className={`ml-auto shrink-0 max-w-[55%] truncate text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            opt.hint === "merged"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {opt.hint}
                        </span>
                      ))}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});
