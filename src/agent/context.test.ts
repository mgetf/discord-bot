import { describe, expect, test } from 'bun:test';
import { buildAgentUserTurn } from '@/agent/context';

const base = {
  guildLabel: 'mge.tf (1)',
  channelLabel: '#ops (2) type=0',
  mentionedChannels: [] as string[],
  repliedMessageContent: null as string | null,
  userText: 'arreglalo'
};

describe('buildAgentUserTurn', () => {
  test('omits replied_message_content when there is no reply', () => {
    const text = buildAgentUserTurn(base);
    expect(text).toContain('mentioned_channels: none');
    expect(text).not.toContain('replied_message_content');
    expect(text.endsWith('\narreglalo')).toBe(true);
  });

  test('includes replied_message_content from the resolved reference', () => {
    const text = buildAgentUserTurn({
      ...base,
      repliedMessageContent: 'anyone can talk in #announcements'
    });
    expect(text).toContain(
      'replied_message_content: anyone can talk in #announcements'
    );
  });
});
