import { describe, expect, test } from 'bun:test';
import { parseOverwriteUpdate } from '@/agent/permissions';

describe('parseOverwriteUpdate', () => {
  test('maps allow deny and unset onto Discord overwrite values', () => {
    expect(
      parseOverwriteUpdate({
        allow: ['SendMessages'],
        deny: ['CreatePublicThreads'],
        unset: ['MentionEveryone']
      })
    ).toEqual({
      patch: {
        SendMessages: true,
        CreatePublicThreads: false,
        MentionEveryone: null
      },
      unknown: []
    });
  });

  test('rejects permissions the agent is not allowed to edit', () => {
    const result = parseOverwriteUpdate({
      allow: ['Administrator', 'SendMessages']
    });
    expect(result.patch).toEqual({ SendMessages: true });
    expect(result.unknown).toEqual(['Administrator']);
  });
});
