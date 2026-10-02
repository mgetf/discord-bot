import { describe, expect, test } from 'bun:test';
import { neutralizeDiscordMentions } from '@/agent/mentions';

describe('neutralizeDiscordMentions', () => {
  test('breaks @everyone and @here so Discord will not ping', () => {
    const text = neutralizeDiscordMentions('Locked. @everyone @here');
    expect(text).not.toMatch(/@everyone/);
    expect(text).not.toMatch(/@here/);
    expect(text).toContain('@\u200beveryone');
    expect(text).toContain('@\u200bhere');
  });

  test('strips user and role mention markup', () => {
    expect(neutralizeDiscordMentions('hi <@123> <@!456> <@&789>')).toBe(
      'hi `user:123` `user:456` `role:789`'
    );
  });
});
