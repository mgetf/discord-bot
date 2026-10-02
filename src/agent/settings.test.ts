import { describe, expect, test } from 'bun:test';
import { DEFAULT_SYSTEM_PROMPT, isAgentModelId } from '@/agent/settings';

describe('agent settings', () => {
  test('default prompt fits the Discord modal', () => {
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeLessThanOrEqual(4000);
  });

  test('default prompt forbids pings without permission', () => {
    const lower = DEFAULT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('do not ping anyone');
    expect(lower).toContain('@everyone');
    expect(lower).toContain('@here');
    expect(lower).toContain('<@&');
  });

  test('isAgentModelId accepts the dropdown values', () => {
    expect(isAgentModelId('claude-haiku-4-5')).toBe(true);
    expect(isAgentModelId('claude-sonnet-5-5')).toBe(true);
    expect(isAgentModelId('claude-opus-5-5')).toBe(true);
    expect(isAgentModelId('gpt-4')).toBe(false);
  });
});
