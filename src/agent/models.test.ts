import { describe, expect, test } from 'bun:test';
import {
  filterAgentModels,
  isAnthropicModelId,
  toAutocompleteChoice
} from '@/agent/models';

const models = [
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet' },
  { id: 'claude-opus-4-6-20260301', name: 'Claude Opus 4.6' }
];

describe('anthropic model catalog helpers', () => {
  test('isAnthropicModelId accepts Claude ids and aliases', () => {
    expect(isAnthropicModelId('claude-haiku-4-5')).toBe(true);
    expect(isAnthropicModelId('claude-sonnet-5-5')).toBe(true);
    expect(isAnthropicModelId('claude-opus-4-6-20260301')).toBe(true);
    expect(isAnthropicModelId('claude-3-7-sonnet-latest')).toBe(true);
    expect(isAnthropicModelId('gpt-4')).toBe(false);
    expect(isAnthropicModelId('claude')).toBe(false);
    expect(isAnthropicModelId('')).toBe(false);
  });

  test('filterAgentModels returns the newest 25 when the query is empty', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `claude-model-${i}`,
      name: `Model ${i}`
    }));
    expect(filterAgentModels(many, '').map((model) => model.id)).toEqual(
      many.slice(0, 25).map((model) => model.id)
    );
  });

  test('filterAgentModels matches id or display name and prefers prefixes', () => {
    const filtered = filterAgentModels(models, 'opus');
    expect(filtered.map((model) => model.id)).toEqual([
      'claude-opus-4-6',
      'claude-opus-4-6-20260301'
    ]);

    const byName = filterAgentModels(models, 'haiku');
    expect(byName.map((model) => model.id)).toEqual(['claude-haiku-4-5']);
  });

  test('toAutocompleteChoice stays within Discord limits', () => {
    const choice = toAutocompleteChoice({
      id: 'claude-sonnet-5-5',
      name: 'Claude Sonnet 5.5'
    });
    expect(choice.value).toBe('claude-sonnet-5-5');
    expect(choice.name).toBe('Claude Sonnet 5.5 (claude-sonnet-5-5)');
    expect(choice.name.length).toBeLessThanOrEqual(100);
    expect(choice.value.length).toBeLessThanOrEqual(100);
  });
});
