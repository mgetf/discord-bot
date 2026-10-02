import { describe, expect, test } from 'bun:test';
import { splitDiscordContent } from '@/agent/split-message';

describe('splitDiscordContent', () => {
  test('returns a placeholder for empty text', () => {
    expect(splitDiscordContent('   ')).toEqual(['(sin texto)']);
  });

  test('keeps short text as a single chunk', () => {
    expect(splitDiscordContent('listo')).toEqual(['listo']);
  });

  test('splits on newlines near the limit', () => {
    const chunks = splitDiscordContent('aaaa\nbbbb\ncccc', 9);
    expect(chunks.join('\n').replaceAll('\n', '').length).toBe(12);
    expect(chunks.every((chunk) => chunk.length <= 9)).toBe(true);
  });
});
