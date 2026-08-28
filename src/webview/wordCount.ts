const WORDS_PER_MINUTE = 200;

export interface ReadingStats {
  readonly words: number;
  readonly minutes: number;
}

/**
 * Count words in rendered preview text and estimate reading time. Words are
 * whitespace-delimited runs; reading time rounds up at 200 wpm with a one-minute
 * floor so any non-empty document reads as at least "1 min".
 */
export function computeReadingStats(text: string): ReadingStats {
  const words = text.trim() === '' ? 0 : (text.match(/\S+/g) ?? []).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  return { words, minutes };
}

/** Format stats for the footer, e.g. `1,245 words · 7 min read`. */
export function formatReadingStats(stats: ReadingStats): string {
  if (stats.words === 0) {
    return '';
  }
  const label = stats.words === 1 ? 'word' : 'words';
  return `${stats.words.toLocaleString()} ${label} · ${stats.minutes} min read`;
}
