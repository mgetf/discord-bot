import { describe, expect, test } from 'bun:test';
import { parseOverwriteUpdate, parsePermissionCsv } from '@/agent/permissions';

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

  test('accepts Administrator like any other PermissionFlagsBits name', () => {
    expect(
      parseOverwriteUpdate({
        allow: ['Administrator', 'SendMessages']
      })
    ).toEqual({
      patch: {
        Administrator: true,
        SendMessages: true
      },
      unknown: []
    });
  });

  test('accepts JDA aliases', () => {
    expect(
      parsePermissionCsv('VIEW_CHANNEL,MESSAGE_SEND,ADMINISTRATOR')
    ).toEqual({
      names: ['ViewChannel', 'SendMessages', 'Administrator'],
      unknown: []
    });
  });

  test('rejects unknown permission names', () => {
    const result = parseOverwriteUpdate({
      allow: ['NotARealPerm', 'SendMessages']
    });
    expect(result.patch).toEqual({ SendMessages: true });
    expect(result.unknown).toEqual(['NotARealPerm']);
  });
});
