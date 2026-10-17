import { ChannelType, ForumLayoutType, SortOrderType } from 'discord.js';
import {
  type AgentTool,
  auditReason,
  boolField,
  csvField,
  defineTool,
  intField,
  json,
  resolveGuildChannel,
  serializeChannelSummary,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

function isForum(
  channel: Awaited<ReturnType<typeof resolveGuildChannel>>
): channel is Extract<
  NonNullable<Awaited<ReturnType<typeof resolveGuildChannel>>>,
  { type: ChannelType.GuildForum }
> {
  return channel?.type === ChannelType.GuildForum;
}

function parseSort(raw: string | undefined) {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper === 'RECENT_ACTIVITY' || upper === 'LATEST_ACTIVITY') {
    return SortOrderType.LatestActivity;
  }
  if (upper === 'CREATION_TIME' || upper === 'CREATION_DATE') {
    return SortOrderType.CreationDate;
  }
  return { error: 'defaultSort must be RECENT_ACTIVITY or CREATION_TIME' };
}

function parseLayout(raw: string | undefined) {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper === 'LIST_VIEW') return ForumLayoutType.ListView;
  if (upper === 'GALLERY_VIEW') return ForumLayoutType.GalleryView;
  return { error: 'defaultLayout must be LIST_VIEW or GALLERY_VIEW' };
}

function serializeTag(tag: { id: string; name: string; moderated: boolean }) {
  return { id: tag.id, name: tag.name, moderated: tag.moderated };
}

function serializeThread(thread: {
  id: string;
  name: string;
  parentId: string | null;
  locked: boolean | null;
  archived: boolean | null;
  messageCount: number | null;
  appliedTags?: readonly string[];
}) {
  return {
    id: thread.id,
    name: thread.name,
    parentId: thread.parentId,
    locked: thread.locked,
    archived: thread.archived,
    messageCount: thread.messageCount,
    appliedTags: thread.appliedTags ?? []
  };
}

async function createForumChannel(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const name = strField(input, 'name');
  if (!name) return json({ error: 'name is required' });
  const created = await ctx.guild.channels.create({
    name,
    type: ChannelType.GuildForum,
    parent: strField(input, 'categoryId', 'category_id'),
    topic: strField(input, 'topic'),
    nsfw: boolField(input, 'nsfw'),
    rateLimitPerUser: intField(input, 'slowmode'),
    position: intField(input, 'position'),
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, channel: serializeChannelSummary(created) });
}

async function editForumChannel(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!isForum(channel))
    return json({ error: `Forum channel ${channelId} not found` });
  const sort = parseSort(strField(input, 'defaultSort', 'default_sort'));
  if (sort && typeof sort === 'object' && 'error' in sort) return json(sort);
  const layout = parseLayout(
    strField(input, 'defaultLayout', 'default_layout')
  );
  if (layout && typeof layout === 'object' && 'error' in layout)
    return json(layout);
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
    defaultSortOrder: sort,
    defaultForumLayout: layout,
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, channel: serializeChannelSummary(edited) });
}

async function listForumChannels(
  _input: Record<string, unknown>,
  ctx: ToolContext
) {
  const forums = [...ctx.guild.channels.cache.values()]
    .filter((channel) => channel.type === ChannelType.GuildForum)
    .map((channel) => serializeChannelSummary(channel));
  return json({ count: forums.length, channels: forums });
}

async function listForumTags(input: Record<string, unknown>, ctx: ToolContext) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!isForum(channel))
    return json({ error: `Forum channel ${channelId} not found` });
  return json({
    channel: serializeChannelSummary(channel),
    tags: channel.availableTags.map((tag) => serializeTag(tag))
  });
}

async function listForumPosts(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!isForum(channel))
    return json({ error: `Forum channel ${channelId} not found` });
  const active = await channel.threads.fetchActive();
  const posts = [...active.threads.values()].map((thread) =>
    serializeThread(thread)
  );
  return json({ count: posts.length, posts });
}

async function createForumPost(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const title = strField(input, 'title', 'name');
  const message = strField(input, 'message', 'content');
  if (!channelId || !title || !message) {
    return json({ error: 'channelId, title, and message are required' });
  }
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!isForum(channel))
    return json({ error: `Forum channel ${channelId} not found` });
  const created = await channel.threads.create({
    name: title,
    message: { content: message.slice(0, 2000) },
    appliedTags: csvField(input, 'tagIds', 'tag_ids')
  });
  return json({ ok: true, post: serializeThread(created) });
}

async function modifyForumPost(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const postId = strField(input, 'postId', 'post_id', 'threadId', 'thread_id');
  if (!postId) return json({ error: 'postId is required' });
  const channel = await resolveGuildChannel(ctx, postId);
  if (!channel?.isThread()) {
    return json({ error: `Forum post ${postId} not found` });
  }
  const reason = auditReason(ctx, strField(input, 'reason'));
  const archived = boolField(input, 'archived');
  const locked = boolField(input, 'locked');
  const pinned = boolField(input, 'pinned');
  const tagIdsRaw = strField(input, 'tagIds', 'tag_ids');

  if (archived === false) await channel.setArchived(false, reason);
  if (locked !== undefined) await channel.setLocked(locked, reason);
  if (pinned === true) await channel.pin(reason);
  if (pinned === false) await channel.unpin(reason);
  if (tagIdsRaw !== undefined) {
    const ids =
      tagIdsRaw.length === 0 ? [] : tagIdsRaw.split(',').map((id) => id.trim());
    await channel.setAppliedTags(ids, reason);
  }
  if (archived === true) await channel.setArchived(true, reason);

  return json({ ok: true, post: serializeThread(channel) });
}

async function listActiveThreads(
  _input: Record<string, unknown>,
  ctx: ToolContext
) {
  const fetched = await ctx.guild.channels.fetchActiveThreads();
  const threads = [...fetched.threads.values()].map((thread) =>
    serializeThread(thread)
  );
  return json({ count: threads.length, threads });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'create_forum_channel',
      'Create a new forum channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        name: { type: 'string', description: 'Channel name' },
        categoryId: { type: 'string', description: 'Category ID' },
        topic: {
          type: 'string',
          description: 'Default post guidelines / topic'
        },
        nsfw: { type: 'string', description: 'Whether channel is NSFW' },
        slowmode: {
          type: 'string',
          description: 'Default slowmode for new posts in seconds (0-21600)'
        },
        position: { type: 'string', description: 'Position in channel list' }
      },
      ['name']
    ),
    run: createForumChannel
  },
  {
    spec: defineTool(
      'edit_forum_channel',
      'Edit settings of a forum channel (name, topic, nsfw, slowmode, category, position, default sort, default layout)',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Forum channel ID' },
        name: { type: 'string', description: 'New channel name' },
        topic: {
          type: 'string',
          description: 'New channel topic / post guidelines'
        },
        nsfw: { type: 'string', description: 'Whether channel is NSFW' },
        slowmode: {
          type: 'string',
          description: 'Default slowmode for new posts in seconds (0-21600)'
        },
        categoryId: {
          type: 'string',
          description: 'Category ID (empty to remove from category)'
        },
        position: { type: 'string', description: 'Position in channel list' },
        defaultSort: {
          type: 'string',
          description: 'Default sort order: RECENT_ACTIVITY or CREATION_TIME'
        },
        defaultLayout: {
          type: 'string',
          description: 'Default layout: LIST_VIEW or GALLERY_VIEW'
        },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['channelId']
    ),
    run: editForumChannel
  },
  {
    spec: defineTool(
      'list_forum_channels',
      'List all forum channels in the server',
      {
        guildId: { type: 'string', description: 'Discord server ID' }
      }
    ),
    run: listForumChannels
  },
  {
    spec: defineTool(
      'list_forum_tags',
      'List all available tags in a forum channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Forum channel ID' }
      },
      ['channelId']
    ),
    run: listForumTags
  },
  {
    spec: defineTool(
      'list_forum_posts',
      'List active posts (threads) in a forum channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Forum channel ID' }
      },
      ['channelId']
    ),
    run: listForumPosts
  },
  {
    spec: defineTool(
      'create_forum_post',
      'Create a new forum post (thread) with an initial message in a forum channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Forum channel ID' },
        title: { type: 'string', description: 'Post title' },
        message: {
          type: 'string',
          description: 'Content of the initial message'
        },
        tagIds: {
          type: 'string',
          description: 'Comma-separated tag IDs to apply'
        }
      },
      ['channelId', 'title', 'message']
    ),
    run: createForumPost
  },
  {
    spec: defineTool(
      'modify_forum_post',
      'Modify a forum post: lock/unlock, archive/unarchive, pin/unpin, or change applied tags',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        postId: { type: 'string', description: 'Forum post (thread) ID' },
        locked: { type: 'string', description: 'Lock state (true/false)' },
        archived: { type: 'string', description: 'Archive state (true/false)' },
        pinned: { type: 'string', description: 'Pin state (true/false)' },
        tagIds: {
          type: 'string',
          description: 'Comma-separated tag IDs to set (empty string to clear)'
        },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['postId']
    ),
    run: modifyForumPost
  },
  {
    spec: defineTool(
      'list_active_threads',
      'List all active threads in the server',
      {
        guildId: { type: 'string', description: 'Discord server ID' }
      }
    ),
    run: listActiveThreads
  }
];
