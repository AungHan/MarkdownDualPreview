import { describe, expect, it } from 'vitest';
import { computeReadingStats, formatReadingStats } from '../../src/webview/wordCount';

describe('computeReadingStats', () => {
  it('counts whitespace-delimited words', () => {
    expect(computeReadingStats('one two three').words).toBe(3);
  });

  it('collapses runs of whitespace and trims', () => {
    expect(computeReadingStats('  a\n\n b   c \t d ').words).toBe(4);
  });

  it('reports zero words and zero minutes for empty text', () => {
    expect(computeReadingStats('   \n\t ')).toEqual({ words: 0, minutes: 0 });
  });

  it('rounds reading time up with a one-minute floor', () => {
    expect(computeReadingStats('word').minutes).toBe(1);
  });

  it('rounds 201 words up to 2 minutes at 200 wpm', () => {
    const text = Array.from({ length: 201 }, () => 'w').join(' ');
    expect(computeReadingStats(text).minutes).toBe(2);
  });
});

describe('formatReadingStats', () => {
  it('formats plural words with reading time', () => {
    expect(formatReadingStats({ words: 1245, minutes: 7 })).toBe('1,245 words · 7 min read');
  });

  it('uses the singular for exactly one word', () => {
    expect(formatReadingStats({ words: 1, minutes: 1 })).toBe('1 word · 1 min read');
  });

  it('returns an empty string when there are no words', () => {
    expect(formatReadingStats({ words: 0, minutes: 0 })).toBe('');
  });
});
