import { ChannelType } from 'discord.js';
import {
  type AgentTool,
  auditReason,
  boolField,
  defineTool,
  intField,
  json,
  rawStrField,
  resolveGuildChannel,
  resolveMember,
  serializeChannelSummary,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

async function createVoiceLike(
  input: Record<string, unknown>,
  ctx: ToolContext,
  type: ChannelType.GuildVoice | ChannelType.GuildStageVoice
) {
  const name = strField(input, 'name');
  if (!name) return json({ error: 'name is required' });
  const created = await ctx.guild.channels.create({
    name,
    type,
    parent: strField(input, 'categoryId', 'category_id'),
    bitrate: intField(input, 'bitrate'),
    userLimit: intField(input, 'userLimit', 'user_limit'),
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, channel: serializeChannelSummary(created) });
}

async function editVoiceChannel(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel?.isVoiceBased()) {
    return json({ error: `Voice channel ${channelId} not found` });
  }
  const rtcRegion = rawStrField(input, 'rtcRegion', 'rtc_region');
  const edited = await channel.edit({
    name: strField(input, 'name'),
    bitrate: intField(input, 'bitrate'),
    userLimit: intField(input, 'userLimit', 'user_limit'),
    rtcRegion:
      rtcRegion === undefined
        ? undefined
        : rtcRegion.length === 0
          ? null
          : rtcRegion,
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, channel: serializeChannelSummary(edited) });
}

async function moveMember(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!userId || !channelId) {
    return json({ error: 'userId and channelId are required' });
  }
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  if (!member.voice.channelId) {
    return json({ error: 'Member is not in a voice channel' });
  }
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel?.isVoiceBased()) {
    return json({ error: `Voice channel ${channelId} not found` });
  }
  await member.voice.setChannel(
    channel,
    auditReason(ctx, strField(input, 'reason'))
  );
  return json({
    ok: true,
    userId: member.id,
    channel: serializeChannelSummary(channel)
  });
}

async function disconnectMember(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const userId = strField(input, 'userId', 'user_id');
  if (!userId) return json({ error: 'userId is required' });
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  await member.voice.disconnect(auditReason(ctx, strField(input, 'reason')));
  return json({ ok: true, userId: member.id });
}

async function modifyVoiceState(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const userId = strField(input, 'userId', 'user_id');
  if (!userId) return json({ error: 'userId is required' });
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  if (!member.voice.channelId) {
    return json({ error: 'Member is not in a voice channel' });
  }
  const mute = boolField(input, 'mute');
  const deafen = boolField(input, 'deafen');
  if (mute === undefined && deafen === undefined) {
    return json({ error: 'Provide mute and/or deafen' });
  }
  const reason = auditReason(ctx, strField(input, 'reason'));
  if (mute !== undefined) await member.voice.setMute(mute, reason);
  if (deafen !== undefined) await member.voice.setDeaf(deafen, reason);
  return json({
    ok: true,
    userId: member.id,
    mute: member.voice.serverMute,
    deaf: member.voice.serverDeaf
  });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'create_voice_channel',
      'Create a new voice channel in a guild',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        name: { type: 'string', description: 'Channel name' },
        categoryId: { type: 'string', description: 'Category ID' },
        userLimit: {
          type: 'string',
          description: 'Max users (0 = unlimited, max 99)'
        },
        bitrate: {
          type: 'string',
          description: 'Audio bitrate in bits/s (e.g. 64000)'
        }
      },
      ['name']
    ),
    run: (input, ctx) => createVoiceLike(input, ctx, ChannelType.GuildVoice)
  },
  {
    spec: defineTool(
      'create_stage_channel',
      'Create a new stage channel for audio events in a guild',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        name: { type: 'string', description: 'Channel name' },
        categoryId: { type: 'string', description: 'Category ID' },
        bitrate: { type: 'string', description: 'Audio bitrate in bits/s' }
      },
      ['name']
    ),
    run: (input, ctx) =>
      createVoiceLike(input, ctx, ChannelType.GuildStageVoice)
  },
  {
    spec: defineTool(
      'edit_voice_channel',
      'Edit settings of a voice or stage channel (name, bitrate, user limit, region)',
      {
        channelId: { type: 'string', description: 'Channel ID' },
        name: { type: 'string', description: 'New channel name' },
        bitrate: { type: 'string', description: 'New bitrate in bits/s' },
        userLimit: {
          type: 'string',
          description: 'New user limit (0 = unlimited)'
        },
        rtcRegion: {
          type: 'string',
          description: "Voice region (e.g. 'us-east'). Empty for automatic"
        }
      },
      ['channelId']
    ),
    run: editVoiceChannel
  },
  {
    spec: defineTool(
      'move_member',
      'Move a member to another voice channel. The member must already be connected to a voice channel.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: { type: 'string', description: 'ID of the user to move' },
        channelId: {
          type: 'string',
          description: 'ID of the target voice channel'
        }
      },
      ['userId', 'channelId']
    ),
    run: moveMember
  },
  {
    spec: defineTool(
      'disconnect_member',
      'Disconnect a member from their current voice channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: { type: 'string', description: 'ID of the user to disconnect' }
      },
      ['userId']
    ),
    run: disconnectMember
  },
  {
    spec: defineTool(
      'modify_voice_state',
      'Server mute or deafen a member across all voice channels. The member must be in a voice channel.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: { type: 'string', description: 'ID of the user' },
        mute: {
          type: 'string',
          description: "Whether to server-mute the user's microphone"
        },
        deafen: {
          type: 'string',
          description: "Whether to server-deafen the user's audio"
        }
      },
      ['userId']
    ),
    run: modifyVoiceState
  }
];
