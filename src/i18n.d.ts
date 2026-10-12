import "i18next";
import type en from "../locales/en.json";

/**
 * Makes `t("…")` keys type-checked against the English catalogue, so a typo or a
 * stale key fails `npm run typecheck` instead of silently rendering the key.
 * English is the reference: every other catalogue must have the same keys
 * (enforced by `npm run i18n:check`).
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    returnNull: false;
    resources: {
      translation: typeof en;
    };
  }
}
