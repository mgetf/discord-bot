import { ChannelType } from 'discord.js';
import {
  type AgentTool,
  auditReason,
  boolField,
  channelTypeName,
  defineTool,
  intField,
  json,
  resolveGuildChannel,
  serializeChannelSummary,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

function serializeChannel(
  channel: Awaited<ReturnType<typeof resolveGuildChannel>>
) {
  if (!channel) return null;
  return {
    ...serializeChannelSummary(channel),
    topic: 'topic' in channel ? (channel.topic ?? null) : null,
    nsfw: 'nsfw' in channel ? Boolean(channel.nsfw) : false,
    position: 'position' in channel ? channel.position : null,
    rateLimitPerUser:
      'rateLimitPerUser' in channel ? channel.rateLimitPerUser : null,
    bitrate: 'bitrate' in channel ? channel.bitrate : null,
    userLimit: 'userLimit' in channel ? channel.userLimit : null
  };
}

async function listChannels(_input: Record<string, unknown>, ctx: ToolContext) {
  const channels = [...ctx.guild.channels.cache.values()]
    .sort((a, b) => {
      const posA = 'rawPosition' in a ? a.rawPosition : 0;
      const posB = 'rawPosition' in b ? b.rawPosition : 0;
      return posA - posB;
    })
    .map((channel) => serializeChannelSummary(channel));
  return json({ count: channels.length, channels });
}

async function findChannel(input: Record<string, unknown>, ctx: ToolContext) {
  const name = strField(input, 'channelName', 'query', 'name');
  if (!name || name.trim().length < 2) {
    return json({ error: 'channelName must be at least 2 characters' });
  }
  const needle = name.trim().toLowerCase();
  const matches = [...ctx.guild.channels.cache.values()]
    .filter((channel) => channel.name.toLowerCase().includes(needle))
    .slice(0, 20)
    .map((channel) => serializeChannelSummary(channel));
  return json({ query: name, count: matches.length, channels: matches });
}

async function getChannelInfo(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id') ?? ctx.channelId;
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel) return json({ error: `Channel ${channelId} not found` });
  return json(serializeChannel(channel));
}

async function createTextChannel(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const name = strField(input, 'name');
  if (!name) return json({ error: 'name is required' });
  const created = await ctx.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: strField(input, 'categoryId', 'category_id'),
    topic: strField(input, 'topic'),
    nsfw: boolField(input, 'nsfw'),
    rateLimitPerUser: intField(input, 'slowmode'),
    position: intField(input, 'position'),
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, channel: serializeChannel(created) });
}

async function editTextChannel(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel) return json({ error: `Channel ${channelId} not found` });
  if (!('edit' in channel)) {
    return json({ error: 'This channel cannot be edited' });
  }
  const categoryId = strField(input, 'categoryId', 'category_id');
  const edited = await channel.edit({
    name: strField(input, 'name'),
    topic: strField(input, 'topic'),
    nsfw: boolField(input, 'nsfw'),
    rateLimitPerUser: intField(input, 'slowmode'),
    parent:
      categoryId === undefined
        ? undefined
        : categoryId.length === 0
          ? null
          : categoryId,
    position: intField(input, 'position'),
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, channel: serializeChannel(edited) });
}

async function deleteChannel(input: Record<string, unknown>, ctx: ToolContext) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel) return json({ error: `Channel ${channelId} not found` });
  await channel.delete(auditReason(ctx, strField(input, 'reason')));
  return json({
    ok: true,
    id: channelId,
    name: channel.name,
    type: channelTypeName(channel.type)
  });
}

async function moveChannel(input: Record<string, unknown>, ctx: ToolContext) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel) return json({ error: `Channel ${channelId} not found` });
  if (!('edit' in channel)) {
    return json({ error: 'This channel cannot be moved' });
  }
  const categoryId = strField(input, 'categoryId', 'category_id');
  const edited = await channel.edit({
    parent:
      categoryId === undefined
        ? undefined
        : categoryId.length === 0
          ? null
          : categoryId,
    position: intField(input, 'position'),
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, channel: serializeChannel(edited) });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool('list_channels', 'List of all channels', {
      guildId: { type: 'string', description: 'Discord server ID' }
    }),
    run: listChannels
  },
  {
    spec: defineTool(
      'find_channel',
      'Find a channel type and ID using name and server ID',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelName: { type: 'string', description: 'Discord channel name' }
      },
      ['channelName']
    ),
    run: findChannel
  },
  {
    spec: defineTool(
      'get_channel_info',
      'Get detailed information about a channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Channel ID' }
      },
      ['channelId']
    ),
    run: getChannelInfo
  },
  {
    spec: defineTool(
      'create_text_channel',
      'Create a new text channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        name: { type: 'string', description: 'Channel name' },
        categoryId: { type: 'string', description: 'Category ID' },
        topic: { type: 'string', description: 'Channel topic' },
        nsfw: { type: 'string', description: 'Whether channel is NSFW' },
        slowmode: {
          type: 'string',
          description: 'Slowmode in seconds (0-21600)'
        },
        position: { type: 'string', description: 'Position in channel list' }
      },
      ['name']
    ),
    run: createTextChannel
  },
  {
    spec: defineTool(
      'edit_text_channel',
      'Edit settings of a text channel (name, topic, nsfw, slowmode, category, position)',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Channel ID' },
        name: { type: 'string', description: 'New channel name' },
        topic: { type: 'string', description: 'New channel topic' },
        nsfw: { type: 'string', description: 'Whether channel is NSFW' },
        slowmode: {
          type: 'string',
          description: 'Slowmode in seconds (0-21600)'
        },
        categoryId: {
          type: 'string',
          description: 'Category ID (empty to remove from category)'
        },
        position: { type: 'string', description: 'Position in channel list' },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['channelId']
    ),
    run: editTextChannel
  },
  {
    spec: defineTool(
      'delete_channel',
      'Delete a channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Discord channel ID' },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['channelId']
    ),
    run: deleteChannel
  },
  {
    spec: defineTool(
      'move_channel',
      'Move a channel to another category and/or change its position',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Channel ID' },
        categoryId: {
          type: 'string',
          description: 'Target category ID (empty to remove from category)'
        },
        position: {
          type: 'string',
          description: 'New position in channel list'
        },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['channelId']
    ),
    run: moveChannel
  }
];
