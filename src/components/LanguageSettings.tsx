import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../hooks/useLanguage";
import { LANGUAGE_META, LANGUAGE_SYSTEM, isSupportedLanguage, type LanguageChoice } from "../lib/i18n";
import { SelectDropdown, type SelectOption } from "./ui/SelectDropdown";

interface LanguageSettingsProps {
  /** Called with the new preference; the parent persists it. */
  onSelect: (choice: LanguageChoice) => void;
}

export const LanguageSettings = memo(function LanguageSettings({ onSelect }: LanguageSettingsProps) {
  const { t } = useTranslation();
  const { choice } = useLanguage();

  const options = useMemo<SelectOption[]>(
    () => [
      { value: LANGUAGE_SYSTEM, label: t("settings.language.followSystem") },
      ...LANGUAGE_META.map((meta) => ({ value: meta.value, label: meta.label })),
    ],
    [t]
  );

  const handleChange = useCallback(
    (value: string) => {
      if (value === LANGUAGE_SYSTEM || isSupportedLanguage(value)) onSelect(value);
    },
    [onSelect]
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {t("settings.language.title")}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t("settings.language.description")}</p>
      <SelectDropdown
        options={options}
        value={choice}
        onChange={handleChange}
        ariaLabel={t("settings.language.label")}
      />
    </div>
  );
});
