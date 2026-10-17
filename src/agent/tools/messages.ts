import {
  type AgentTool,
  defineTool,
  fetchMessagePage,
  json,
  resolveTextChannel,
  serializeMessage,
  strField
} from '@/agent/tools/shared';

async function readMessages(
  input: Record<string, unknown>,
  ctx: import('@/agent/tools/shared').ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id') ?? ctx.channelId;
  const channel = await resolveTextChannel(ctx, channelId);
  if ('error' in channel) return json(channel);
  const page = await fetchMessagePage(channel, input);
  if ('error' in page) return json(page);
  return json({
    channelId,
    count: page.messages.length,
    messages: page.messages
  });
}

async function sendMessage(
  input: Record<string, unknown>,
  ctx: import('@/agent/tools/shared').ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const content = strField(input, 'message', 'content');
  if (!channelId) return json({ error: 'channelId is required' });
  if (!content) return json({ error: 'message is required' });
  const channel = await resolveTextChannel(ctx, channelId);
  if ('error' in channel) return json(channel);
  if (!('send' in channel)) {
    return json({ error: `Channel ${channelId} cannot send messages` });
  }
  const sent = await channel.send({ content: content.slice(0, 2000) });
  return json({ ok: true, message: serializeMessage(sent) });
}

async function editMessage(
  input: Record<string, unknown>,
  ctx: import('@/agent/tools/shared').ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const messageId = strField(input, 'messageId', 'message_id');
  const content = strField(input, 'newMessage', 'message', 'content');
  if (!channelId || !messageId) {
    return json({ error: 'channelId and messageId are required' });
  }
  if (!content) return json({ error: 'newMessage is required' });
  const channel = await resolveTextChannel(ctx, channelId);
  if ('error' in channel) return json(channel);
  const message = await channel.messages.fetch(messageId);
  const edited = await message.edit({ content: content.slice(0, 2000) });
  return json({ ok: true, message: serializeMessage(edited) });
}

async function deleteMessage(
  input: Record<string, unknown>,
  ctx: import('@/agent/tools/shared').ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const messageId = strField(input, 'messageId', 'message_id');
  if (!channelId || !messageId) {
    return json({ error: 'channelId and messageId are required' });
  }
  const channel = await resolveTextChannel(ctx, channelId);
  if ('error' in channel) return json(channel);
  const message = await channel.messages.fetch(messageId);
  await message.delete();
  return json({ ok: true, id: messageId });
}

async function addReaction(
  input: Record<string, unknown>,
  ctx: import('@/agent/tools/shared').ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const messageId = strField(input, 'messageId', 'message_id');
  const emoji = strField(input, 'emoji');
  if (!channelId || !messageId || !emoji) {
    return json({ error: 'channelId, messageId, and emoji are required' });
  }
  const channel = await resolveTextChannel(ctx, channelId);
  if ('error' in channel) return json(channel);
  const message = await channel.messages.fetch(messageId);
  await message.react(emoji);
  return json({ ok: true, messageId, emoji });
}

async function removeReaction(
  input: Record<string, unknown>,
  ctx: import('@/agent/tools/shared').ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const messageId = strField(input, 'messageId', 'message_id');
  const emoji = strField(input, 'emoji');
  if (!channelId || !messageId || !emoji) {
    return json({ error: 'channelId, messageId, and emoji are required' });
  }
  const channel = await resolveTextChannel(ctx, channelId);
  if ('error' in channel) return json(channel);
  const message = await channel.messages.fetch(messageId);
  const reaction = message.reactions.resolve(emoji);
  if (!reaction) return json({ error: `No reaction ${emoji} on that message` });
  const me = ctx.guild.client.user?.id;
  if (me) await reaction.users.remove(me).catch(() => undefined);
  await reaction.remove().catch(() => undefined);
  return json({ ok: true, messageId, emoji });
}

async function getAttachment(
  input: Record<string, unknown>,
  ctx: import('@/agent/tools/shared').ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const messageId = strField(input, 'messageId', 'message_id');
  const attachmentId = strField(input, 'attachmentId', 'attachment_id');
  if (!channelId || !messageId) {
    return json({ error: 'channelId and messageId are required' });
  }
  const channel = await resolveTextChannel(ctx, channelId);
  if ('error' in channel) return json(channel);
  const message = await channel.messages.fetch(messageId);
  const attachments = [...message.attachments.values()].map((item) => ({
    id: item.id,
    name: item.name,
    size: item.size,
    url: item.url,
    proxyURL: item.proxyURL,
    contentType: item.contentType
  }));
  if (attachmentId) {
    const match = attachments.find((item) => item.id === attachmentId);
    if (!match) return json({ error: `Attachment ${attachmentId} not found` });
    return json({ attachment: match });
  }
  return json({ count: attachments.length, attachments });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'read_messages',
      'Read message history from a specific channel, optionally paginated with before/after/around',
      {
        channelId: { type: 'string', description: 'Discord channel ID' },
        count: {
          type: 'string',
          description: 'Number of messages to retrieve (1-100)'
        },
        before: {
          type: 'string',
          description: 'Message ID to fetch messages before this message'
        },
        after: {
          type: 'string',
          description: 'Message ID to fetch messages after this message'
        },
        around: {
          type: 'string',
          description: 'Message ID to fetch messages around this message'
        }
      },
      ['channelId']
    ),
    run: readMessages
  },
  {
    spec: defineTool(
      'send_message',
      'Send a message to a specific channel',
      {
        channelId: { type: 'string', description: 'Discord channel ID' },
        message: { type: 'string', description: 'Message content' }
      },
      ['channelId', 'message']
    ),
    run: sendMessage
  },
  {
    spec: defineTool(
      'edit_message',
      'Edit a message from a specific channel',
      {
        channelId: { type: 'string', description: 'Discord channel ID' },
        messageId: { type: 'string', description: 'Specific message ID' },
        newMessage: { type: 'string', description: 'New message content' }
      },
      ['channelId', 'messageId', 'newMessage']
    ),
    run: editMessage
  },
  {
    spec: defineTool(
      'delete_message',
      'Delete a message from a specific channel',
      {
        channelId: { type: 'string', description: 'Discord channel ID' },
        messageId: { type: 'string', description: 'Specific message ID' }
      },
      ['channelId', 'messageId']
    ),
    run: deleteMessage
  },
  {
    spec: defineTool(
      'add_reaction',
      'Add a reaction (emoji) to a specific message',
      {
        channelId: { type: 'string', description: 'Discord channel ID' },
        messageId: { type: 'string', description: 'Discord message ID' },
        emoji: { type: 'string', description: 'Emoji (Unicode or string)' }
      },
      ['channelId', 'messageId', 'emoji']
    ),
    run: addReaction
  },
  {
    spec: defineTool(
      'remove_reaction',
      'Remove a specified reaction (emoji) from a message',
      {
        channelId: { type: 'string', description: 'Discord channel ID' },
        messageId: { type: 'string', description: 'Discord message ID' },
        emoji: { type: 'string', description: 'Emoji (Unicode or string)' }
      },
      ['channelId', 'messageId', 'emoji']
    ),
    run: removeReaction
  },
  {
    spec: defineTool(
      'get_attachment',
      'Get attachment metadata from a specific message. Returns info only, does not download files.',
      {
        channelId: { type: 'string', description: 'Discord channel ID' },
        messageId: { type: 'string', description: 'Discord message ID' },
        attachmentId: {
          type: 'string',
          description: 'Specific attachment ID (omit to get all attachments)'
        }
      },
      ['channelId', 'messageId']
    ),
    run: getAttachment
  }
];
