import { describe, expect, test } from 'bun:test';
import { inboxMessageFrom } from '@/outbox/inbox';

const base = {
  id: '900',
  content: ' hello ',
  author: { id: '111', username: 'alice' },
  attachments: [],
  replyToMessageId: null
};

describe('inboxMessageFrom', () => {
  test('trims text and keeps who sent it', () => {
    expect(inboxMessageFrom(base)).toEqual({
      discordMessageId: '900',
      discordUserId: '111',
      discordUsername: 'alice',
      content: 'hello',
      attachments: [],
      replyToMessageId: null
    });
  });

  test('keeps the message a reply answers', () => {
    expect(
      inboxMessageFrom({ ...base, replyToMessageId: '800' })?.replyToMessageId
    ).toBe('800');
  });

  test('forwards an attachment with no text', () => {
    const msg = inboxMessageFrom({
      ...base,
      content: '',
      attachments: [{ name: 'shot.png', url: 'https://cdn.example/shot.png' }]
    });
    expect(msg?.attachments).toHaveLength(1);
  });

  test('drops an empty message', () => {
    expect(inboxMessageFrom({ ...base, content: '   ' })).toBeNull();
  });

  test('caps very long text', () => {
    expect(
      inboxMessageFrom({ ...base, content: 'x'.repeat(9000) })?.content.length
    ).toBe(4000);
  });
});
