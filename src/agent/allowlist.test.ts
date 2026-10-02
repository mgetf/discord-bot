import { describe, expect, test } from 'bun:test';
import { userIdAllowed } from '@/agent/allowlist';

describe('userIdAllowed', () => {
  test('allowlist wins over application owner', () => {
    expect(userIdAllowed('maxi', ['maxi'], 'someone-else')).toBe(true);
    expect(userIdAllowed('other', ['maxi'], 'other')).toBe(false);
  });

  test('empty allowlist falls back to application owner', () => {
    expect(userIdAllowed('owner', [], 'owner')).toBe(true);
    expect(userIdAllowed('intruder', [], 'owner')).toBe(false);
  });

  test('denies everyone when allowlist and owner are empty', () => {
    expect(userIdAllowed('anyone', [], null)).toBe(false);
  });
});
