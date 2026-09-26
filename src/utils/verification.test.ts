import { describe, expect, test } from 'bun:test';
import { verificationRoleDiff } from '@/utils/verification';

describe('verificationRoleDiff', () => {
  const add = ['mger'];
  const remove = ['unverified'];

  test('adds MGER and removes Unverified when verifying', () => {
    expect(
      verificationRoleDiff(['unverified', 'eu'], true, add, remove)
    ).toEqual({
      toAdd: ['mger'],
      toRemove: ['unverified']
    });
  });

  test('adds Unverified and removes MGER when unverifying', () => {
    expect(verificationRoleDiff(['mger', 'eu'], false, add, remove)).toEqual({
      toAdd: ['unverified'],
      toRemove: ['mger']
    });
  });

  test('no-ops when roles already match', () => {
    expect(verificationRoleDiff(['mger', 'eu'], true, add, remove)).toEqual({
      toAdd: [],
      toRemove: []
    });
  });
});
