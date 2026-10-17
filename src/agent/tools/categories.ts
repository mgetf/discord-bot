import { ChannelType } from 'discord.js';
import {
  type AgentTool,
  auditReason,
  defineTool,
  intField,
  json,
  resolveGuildChannel,
  serializeChannelSummary,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

async function createCategory(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const name = strField(input, 'name');
  if (!name) return json({ error: 'name is required' });
  const created = await ctx.guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, category: serializeChannelSummary(created) });
}

async function editCategory(input: Record<string, unknown>, ctx: ToolContext) {
  const categoryId = strField(input, 'categoryId', 'category_id');
  if (!categoryId) return json({ error: 'categoryId is required' });
  const channel = await resolveGuildChannel(ctx, categoryId);
  if (!channel || channel.type !== ChannelType.GuildCategory) {
    return json({ error: `Category ${categoryId} not found` });
  }
  const edited = await channel.edit({
    name: strField(input, 'name'),
    position: intField(input, 'position'),
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, category: serializeChannelSummary(edited) });
}

async function deleteCategory(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const categoryId = strField(input, 'categoryId', 'category_id');
  if (!categoryId) return json({ error: 'categoryId is required' });
  const channel = await resolveGuildChannel(ctx, categoryId);
  if (!channel || channel.type !== ChannelType.GuildCategory) {
    return json({ error: `Category ${categoryId} not found` });
  }
  await channel.delete(auditReason(ctx, strField(input, 'reason')));
  return json({ ok: true, id: categoryId, name: channel.name });
}

async function findCategory(input: Record<string, unknown>, ctx: ToolContext) {
  const name = strField(input, 'categoryName', 'name');
  if (!name || name.trim().length < 2) {
    return json({ error: 'categoryName must be at least 2 characters' });
  }
  const needle = name.trim().toLowerCase();
  const matches = [...ctx.guild.channels.cache.values()]
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .filter((channel) => channel.name.toLowerCase().includes(needle))
    .slice(0, 20)
    .map((channel) => serializeChannelSummary(channel));
  return json({ query: name, count: matches.length, categories: matches });
}

async function listChannelsInCategory(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const categoryId = strField(input, 'categoryId', 'category_id');
  if (!categoryId) return json({ error: 'categoryId is required' });
  const parent = await resolveGuildChannel(ctx, categoryId);
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    return json({ error: `Category ${categoryId} not found` });
  }
  const children = [...ctx.guild.channels.cache.values()]
    .filter((channel) => channel.parentId === categoryId)
    .map((channel) => serializeChannelSummary(channel));
  return json({
    category: serializeChannelSummary(parent),
    count: children.length,
    channels: children
  });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'create_category',
      'Create a new category for channels',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        name: { type: 'string', description: 'Discord category name' }
      },
      ['name']
    ),
    run: createCategory
  },
  {
    spec: defineTool(
      'edit_category',
      'Edit a category (rename or move position)',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        categoryId: { type: 'string', description: 'Discord category ID' },
        name: { type: 'string', description: 'New category name' },
        position: {
          type: 'string',
          description: 'New position in channel list'
        },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['categoryId']
    ),
    run: editCategory
  },
  {
    spec: defineTool(
      'delete_category',
      'Delete a category',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        categoryId: { type: 'string', description: 'Discord category ID' }
      },
      ['categoryId']
    ),
    run: deleteCategory
  },
  {
    spec: defineTool(
      'find_category',
      'Find a category ID using name and server ID',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        categoryName: { type: 'string', description: 'Discord category name' }
      },
      ['categoryName']
    ),
    run: findCategory
  },
  {
    spec: defineTool(
      'list_channels_in_category',
      'List of channels in a specific category',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        categoryId: { type: 'string', description: 'Discord category ID' }
      },
      ['categoryId']
    ),
    run: listChannelsInCategory
  }
];
