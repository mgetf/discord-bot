import { describe, expect, test } from 'bun:test';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import {
  clearSessionsForTests,
  getOrCreateSession,
  pruneAgentMessages,
  pruneExpiredSessions,
  SESSION_TTL_MS,
  sessionKey
} from '@/agent/sessions';

describe('agent sessions', () => {
  test('keys a conversation by channel and user', () => {
    expect(sessionKey('c1', 'u1')).toBe('c1:u1');
  });

  test('reuses the same in-memory session', () => {
    clearSessionsForTests();
    const first = getOrCreateSession('c1', 'u1');
    const second = getOrCreateSession('c1', 'u1');
    expect(second).toBe(first);
    expect(getOrCreateSession('c1', 'u2')).not.toBe(first);
  });

  test('drops idle sessions after the TTL', () => {
    clearSessionsForTests();
    const session = getOrCreateSession('c1', 'u1');
    session.updatedAt = Date.now() - SESSION_TTL_MS - 1;
    pruneExpiredSessions();
    expect(getOrCreateSession('c1', 'u1')).not.toBe(session);
  });

  test('prunes from a user turn, never a dangling tool result', () => {
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: '1', content: 'x' }]
      },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' }
    ];
    expect(pruneAgentMessages(messages, 2)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' }
    ]);
  });
});
