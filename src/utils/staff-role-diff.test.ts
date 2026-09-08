import { describe, expect, test } from 'bun:test';
import { managedRoleReconcile, roleIdSetsEqual } from '@/utils/staff-role-diff';

describe('roleIdSetsEqual', () => {
  test('treats the same ids in any order as equal', () => {
    expect(roleIdSetsEqual(['a', 'b'], ['b', 'a'])).toBe(true);
  });

  test('detects added or removed ids', () => {
    expect(roleIdSetsEqual(['a'], ['a', 'b'])).toBe(false);
    expect(roleIdSetsEqual(['a', 'b'], ['a'])).toBe(false);
  });
});

describe('managedRoleReconcile', () => {
  const managed = new Set(['staff', 'mod', 'admin']);

  test('removes hub roles the site does not assign', () => {
    expect(managedRoleReconcile(['fun', 'admin'], [], managed)).toEqual({
      toAdd: [],
      toRemove: ['admin']
    });
  });

  test('restores hub roles the site still assigns', () => {
    expect(managedRoleReconcile(['fun'], ['staff', 'mod'], managed)).toEqual({
      toAdd: ['staff', 'mod'],
      toRemove: []
    });
  });

  test('ignores desired ids outside the hub catalog', () => {
    expect(
      managedRoleReconcile(['fun'], ['not-managed', 'staff'], managed)
    ).toEqual({
      toAdd: ['staff'],
      toRemove: []
    });
  });

  test('no-ops when current managed roles already match', () => {
    expect(managedRoleReconcile(['fun', 'staff'], ['staff'], managed)).toEqual({
      toAdd: [],
      toRemove: []
    });
  });
});
