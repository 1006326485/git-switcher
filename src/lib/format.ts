import { getResolvedLanguage } from "./i18n";

export type DateInput = Date | number | string;

/**
 * The locale of the interface language, not of the operating system, so dates
 * and numbers always match the text around them.
 */
export function getLocale(): string {
  return getResolvedLanguage();
}

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(
    getLocale(),
    options ?? { year: "numeric", month: "2-digit", day: "2-digit" }
  ).format(toDate(value));
}

export function formatTime(value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(
    getLocale(),
    options ?? { hour: "2-digit", minute: "2-digit" }
  ).format(toDate(value));
}

export function formatDateTime(value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(
    getLocale(),
    options ?? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
  ).format(toDate(value));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(), options).format(value);
}

export function relativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions
): string {
  return new Intl.RelativeTimeFormat(getLocale(), options ?? { numeric: "auto" }).format(value, unit);
}

export function getCollator(options?: Intl.CollatorOptions): Intl.Collator {
  return new Intl.Collator(getLocale(), options ?? { sensitivity: "base", numeric: true });
}
