import { describe, expect, test } from 'bun:test';
import { shouldHandleAgentMessage } from '@/agent/trigger';

const base = {
  authorBot: false,
  inGuild: true,
  allowed: true,
  agentConfigured: true,
  mentionedBot: false,
  replyToBot: false
};

describe('shouldHandleAgentMessage', () => {
  test('starts a turn when the bot is mentioned', () => {
    expect(shouldHandleAgentMessage({ ...base, mentionedBot: true })).toBe(
      true
    );
  });

  test('continues a turn when the user replies to the bot', () => {
    expect(shouldHandleAgentMessage({ ...base, replyToBot: true })).toBe(true);
  });

  test('ignores ordinary channel chatter', () => {
    expect(shouldHandleAgentMessage(base)).toBe(false);
  });

  test('ignores users who are not on the allowlist', () => {
    expect(
      shouldHandleAgentMessage({ ...base, allowed: false, mentionedBot: true })
    ).toBe(false);
  });

  test('ignores DMs and other bots', () => {
    expect(
      shouldHandleAgentMessage({ ...base, inGuild: false, mentionedBot: true })
    ).toBe(false);
    expect(
      shouldHandleAgentMessage({ ...base, authorBot: true, mentionedBot: true })
    ).toBe(false);
  });

  test('no-ops when the API key is missing', () => {
    expect(
      shouldHandleAgentMessage({
        ...base,
        agentConfigured: false,
        mentionedBot: true
      })
    ).toBe(false);
  });
});
