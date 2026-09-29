/**
 * Bounded LRU cache for pre-rendered highlight HTML.
 *
 * Diff rows are highlighted on every render, including each virtualized scroll
 * frame. Results are keyed by content + language + search query + the current
 * match occurrence so re-renders reuse work instead of re-running the
 * multi-pass highlight regexes on every visible row.
 */
const MAX_ENTRIES = 5000;

export interface HighlightKey {
  content: string;
  language: string;
  searchQuery: string;
  currentOccurrence?: number;
}

const cache = new Map<string, string>();

function cacheKey(parts: HighlightKey): string {
  return [parts.language, parts.searchQuery, parts.currentOccurrence ?? "", parts.content].join("\u0000");
}

/** Return cached highlight HTML for `parts`, computing and storing it on a miss. */
export function getOrComputeHighlight(parts: HighlightKey, compute: () => string): string {
  const key = cacheKey(parts);
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit); // re-insert: mark as most recently used
    return hit;
  }
  if (cache.size >= MAX_ENTRIES) {
    for (const oldestKey of cache.keys()) {
      cache.delete(oldestKey);
      break;
    }
  }
  const html = compute();
  cache.set(key, html);
  return html;
}

export function clearHighlightCache(): void {
  cache.clear();
}

export function highlightCacheSize(): number {
  return cache.size;
}
