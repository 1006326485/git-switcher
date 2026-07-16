import { memo } from "react";

const ACCENT_PRESETS = [
  { id: "blue", color: "#3b82f6", label: "Blue" },
  { id: "green", color: "#22c55e", label: "Green" },
  { id: "purple", color: "#a855f7", label: "Purple" },
  { id: "red", color: "#ef4444", label: "Red" },
  { id: "orange", color: "#f97316", label: "Orange" },
  { id: "pink", color: "#ec4899", label: "Pink" },
  { id: "teal", color: "#14b8a6", label: "Teal" },
  { id: "indigo", color: "#6366f1", label: "Indigo" },
];

interface ThemeSettingsProps {
  accentColor: string;
  onAccentChange: (color: string) => void;
}

export const ThemeSettings = memo(function ThemeSettings({
  accentColor,
  onAccentChange,
}: ThemeSettingsProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Accent Color</h3>
      <div className="flex items-center gap-2 flex-wrap">
        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onAccentChange(preset.id)}
            className={`w-8 h-8 rounded-full transition-all duration-150 flex items-center justify-center ${
              accentColor === preset.id
                ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 scale-110"
                : "hover:scale-105"
            }`}
            style={{
              backgroundColor: preset.color,
              outlineColor: accentColor === preset.id ? preset.color : undefined,
            }}
            title={preset.label}
            aria-label={`${preset.label} accent color`}
          >
            {accentColor === preset.id && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="white">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});
