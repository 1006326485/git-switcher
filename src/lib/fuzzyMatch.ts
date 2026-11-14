/**
 * Fuzzy search used by every list filter in the app (dropdowns, project
 * lists, palettes, sidebars).
 *
 * A query term matches a text when it lines up with the start of a token
 * ("gcfp" → "gcf-player", "gcf_play") or, failing that, when its letters
 * appear in order ("gcp" → "gcf-player"). Several whitespace-separated terms
 * must ALL match the same text. An exact substring always matches too, so the
 * fuzzy rules extend the old `includes` filter instead of replacing it: a
 * query that used to find something still finds it.
 */

/** Separators that start a new word in project names, branches, paths and commands. */
const TOKEN_BOUNDARY = /[^a-z0-9]/;
/** Characters without a case in `toLowerCase` (CJK, emoji) have no word boundary to detect. */
const CASED = /[\p{L}\p{N}]/u;

export interface FuzzyQuery {
  /** Lowercased terms, in query order. */
  terms: string[];
  /** The lowercased query with its whitespace collapsed. */
  text: string;
}

const SCORE_NO_MATCH = 0;
const SCORE_SUBSTRING = 1000;
const SCORE_ACRONYM = 900;
const SCORE_SUBSEQUENCE = 500;

/**
 * Splits the query the way it will be matched. A blank query has no terms,
 * which every predicate here reads as "no filter".
 */
export function parseFuzzyQuery(query: string): FuzzyQuery {
  const text = query.trim().toLowerCase();
  return { terms: text.split(/\s+/).filter(Boolean), text };
}

function isTokenStart(lower: string, index: number): boolean {
  if (index === 0) return true;
  const prev = lower[index - 1];
  return TOKEN_BOUNDARY.test(prev) || (!CASED.test(prev) && !CASED.test(lower[index]));
}

/** The whole term contained verbatim (the previous filter behavior). */
function scoreSubstring(lower: string, term: string): number {
  if (!lower.includes(term)) return SCORE_NO_MATCH;
  let score = SCORE_SUBSTRING;
  // Earlier position is a better match, with at most a 200-point edge.
  const at = lower.indexOf(term);
  score -= Math.min(at, 199);
  // A token start ("gcf" in "gcf-player") beats a mid-word hit, so the
  // abbreviation rarely outranks the name it abbreviates.
  if (isTokenStart(lower, at)) score += 100;
  // For equally placed hits the shorter text is the closer fit,
  // "gcf-player" over "gcf-something-else".
  score -= Math.min(lower.length, 99);
  return score;
}

/** Source indices of the first in-order match; empty when the letters are not all present. */
function subsequenceSources(lower: string, term: string): number[] {
  const picked: number[] = [];
  let prev = -1;
  for (const ch of term) {
    const at = lower.indexOf(ch, prev + 1);
    if (at === -1) return [];
    picked.push(at);
    prev = at;
  }
  return picked;
}

function scoreSubsequence(lower: string, term: string): { score: number; sources: number[] } {
  const sources = subsequenceSources(lower, term);
  if (sources.length === 0) return { score: SCORE_NO_MATCH, sources };
  const starts = sources.filter((at) => isTokenStart(lower, at)).length;
  const span = sources[sources.length - 1] - sources[0];
  const score =
    SCORE_SUBSEQUENCE +
    // Every letter starting a word reads as an acronym, not scattered noise.
    (starts === term.length ? SCORE_ACRONYM : 0) +
    // Tighter matches (shorter span) beat spread-out ones.
    Math.max(0, 100 - span) +
    // …and earlier first characters win ties.
    Math.max(0, 50 - sources[0]);
  return { score, sources };
}

/**
 * Scores `text` against the query. Returns 0 when any term does not match,
 * so the score doubles as a `filter` predicate.
 */
export function scoreFuzzyMatch(text: string, query: FuzzyQuery): number {
  if (query.terms.length === 0) return 1;
  const lower = text.toLowerCase();
  let total = 0;
  for (const term of query.terms) {
    const direct = scoreSubstring(lower, term);
    if (direct !== SCORE_NO_MATCH) {
      total += direct;
      continue;
    }
    const best = scoreSubsequence(lower, term);
    if (best.score === SCORE_NO_MATCH) return SCORE_NO_MATCH;
    total += best.score;
  }
  return total;
}

/** True for an empty query too: a blank search shows everything. */
export function matchesFuzzy(text: string, query: FuzzyQuery): boolean {
  return scoreFuzzyMatch(text, query) !== SCORE_NO_MATCH;
}

/**
 * Keeps the items any of whose fields matches, ordered by the best field's
 * score (highest first). Equal scores keep the incoming order.
 */
export function filterByFuzzy<T>(
  items: readonly T[],
  query: FuzzyQuery,
  fields: (item: T) => readonly string[]
): T[] {
  if (query.terms.length === 0) return [...items];
  const scored: { item: T; score: number; rank: number }[] = [];
  items.forEach((item, rank) => {
    const score = Math.max(...fields(item).map((field) => scoreFuzzyMatch(field, query)));
    if (score !== SCORE_NO_MATCH) scored.push({ item, score, rank });
  });
  scored.sort((a, b) => b.score - a.score || a.rank - b.rank);
  return scored.map((s) => s.item);
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const merged: [number, number][] = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * The character ranges of `text` that matched, for highlighting. A substring
 * term returns every occurrence; an acronym or subsequence term returns one
 * range per matched letter.
 */
export function fuzzyMatchRanges(text: string, query: FuzzyQuery): [number, number][] {
  if (query.terms.length === 0) return [];
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const term of query.terms) {
    let from = lower.indexOf(term);
    if (from !== -1) {
      while (from !== -1) {
        ranges.push([from, from + term.length]);
        from = lower.indexOf(term, from + term.length);
      }
      continue;
    }
    ranges.push(...subsequenceSources(lower, term).map((at): [number, number] => [at, at + 1]));
  }
  return mergeRanges(ranges);
}
