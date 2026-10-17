import { describe, expect, test } from 'bun:test';
import type { Guild } from 'discord.js';
import { agentToolNames, executeAgentTool } from '@/agent/discord-tools';
import {
  clipText,
  MESSAGE_CONTENT_MAX,
  parseCount,
  rejectForeignGuild,
  type ToolContext
} from '@/agent/tools/shared';

const REQUIRED_TOOLS = [
  'get_server_info',
  'read_messages',
  'send_message',
  'edit_message',
  'delete_message',
  'add_reaction',
  'remove_reaction',
  'get_attachment',
  'list_channels',
  'find_channel',
  'get_channel_info',
  'create_text_channel',
  'edit_text_channel',
  'delete_channel',
  'move_channel',
  'create_category',
  'edit_category',
  'delete_category',
  'find_category',
  'list_channels_in_category',
  'list_roles',
  'create_role',
  'edit_role',
  'delete_role',
  'assign_role',
  'remove_role',
  'kick_member',
  'ban_member',
  'unban_member',
  'timeout_member',
  'remove_timeout',
  'set_nickname',
  'get_bans',
  'list_channel_permission_overwrites',
  'upsert_role_channel_permissions',
  'upsert_member_channel_permissions',
  'delete_channel_permission_overwrite',
  'create_voice_channel',
  'create_stage_channel',
  'edit_voice_channel',
  'move_member',
  'disconnect_member',
  'modify_voice_state',
  'create_guild_scheduled_event',
  'edit_guild_scheduled_event',
  'delete_guild_scheduled_event',
  'list_guild_scheduled_events',
  'get_guild_scheduled_event_users',
  'create_invite',
  'list_invites',
  'delete_invite',
  'get_invite_details',
  'create_webhook',
  'list_webhooks',
  'delete_webhook',
  'send_webhook_message',
  'create_forum_channel',
  'edit_forum_channel',
  'list_forum_channels',
  'list_forum_tags',
  'list_forum_posts',
  'create_forum_post',
  'modify_forum_post',
  'list_active_threads',
  'list_emojis',
  'get_emoji_details',
  'create_emoji',
  'edit_emoji',
  'delete_emoji',
  'get_user_id_by_name',
  'send_private_message',
  'edit_private_message',
  'delete_private_message',
  'read_private_messages'
] as const;

function fakeCtx(guildId = '111'): ToolContext {
  return {
    guild: { id: guildId, name: 'Test Guild' } as Guild,
    channelId: 'channel-1',
    requesterTag: 'owner#0001'
  };
}

describe('parseCount', () => {
  test('defaults to 10', () => {
    expect(parseCount(undefined)).toEqual({ ok: true, value: 10 });
  });

  test('accepts 1 and 100', () => {
    expect(parseCount(1)).toEqual({ ok: true, value: 1 });
    expect(parseCount('100')).toEqual({ ok: true, value: 100 });
  });

  test('rejects values outside 1-100', () => {
    expect(parseCount(0).ok).toBe(false);
    expect(parseCount(101).ok).toBe(false);
  });
});

describe('clipText', () => {
  test('leaves short text intact', () => {
    expect(clipText('hello')).toBe('hello');
  });

  test('clips long message content', () => {
    const long = 'x'.repeat(MESSAGE_CONTENT_MAX + 20);
    const clipped = clipText(long);
    expect(clipped.endsWith('…')).toBe(true);
    expect(clipped.length).toBe(MESSAGE_CONTENT_MAX + 1);
  });
});

describe('rejectForeignGuild', () => {
  test('allows omitted guildId', () => {
    expect(rejectForeignGuild(fakeCtx(), {})).toBeUndefined();
  });

  test('allows matching guildId', () => {
    expect(rejectForeignGuild(fakeCtx(), { guildId: '111' })).toBeUndefined();
  });

  test('rejects another guildId', () => {
    const result = rejectForeignGuild(fakeCtx(), { guildId: '222' });
    expect(result).toBeDefined();
    expect(result).toContain('Refusing action on another guild');
  });
});

describe('executeAgentTool', () => {
  test('knows every catalog name', () => {
    const names = agentToolNames();
    expect(new Set(names).size).toBe(names.length);
    for (const name of REQUIRED_TOOLS) {
      expect(names).toContain(name);
    }
  });

  test('returns an error for unknown tools', async () => {
    const result = JSON.parse(
      await executeAgentTool('not_a_real_tool', {}, fakeCtx())
    ) as { error: string };
    expect(result.error).toContain('Unknown tool');
  });

  test('rejects a foreign guildId before the handler runs', async () => {
    const result = JSON.parse(
      await executeAgentTool(
        'get_server_info',
        { guildId: '999' },
        fakeCtx('111')
      )
    ) as { error: string };
    expect(result.error).toContain('Refusing action on another guild');
  });
});
