import {
  type AgentTool,
  defineTool,
  fetchMessagePage,
  json,
  serializeMessage,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

async function resolveDmChannel(ctx: ToolContext, userId: string) {
  const user = await ctx.guild.client.users.fetch(userId);
  return user.createDM();
}

async function getUserIdByName(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const username = strField(input, 'username', 'name');
  if (!username || username.trim().length < 2) {
    return json({ error: 'username must be at least 2 characters' });
  }
  const needle = username.trim().toLowerCase().split('#')[0] ?? '';
  let matches = [...ctx.guild.members.cache.values()].filter((member) => {
    const uname = member.user.username.toLowerCase();
    const global = member.user.globalName?.toLowerCase() ?? '';
    const nick = member.nickname?.toLowerCase() ?? '';
    return (
      uname === needle ||
      uname.includes(needle) ||
      global.includes(needle) ||
      nick.includes(needle)
    );
  });
  if (matches.length === 0) {
    const searched = await ctx.guild.members
      .search({ query: username, limit: 10 })
      .catch(() => null);
    if (searched) matches = [...searched.values()];
  }
  return json({
    query: username,
    count: matches.length,
    users: matches.slice(0, 15).map((member) => ({
      id: member.id,
      username: member.user.username,
      globalName: member.user.globalName,
      nick: member.nickname,
      mention: `<@${member.id}>`
    }))
  });
}

async function sendPrivateMessage(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const userId = strField(input, 'userId', 'user_id');
  const content = strField(input, 'message', 'content');
  if (!userId || !content) {
    return json({ error: 'userId and message are required' });
  }
  const dm = await resolveDmChannel(ctx, userId);
  const sent = await dm.send({ content: content.slice(0, 2000) });
  return json({ ok: true, message: serializeMessage(sent) });
}

async function editPrivateMessage(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const userId = strField(input, 'userId', 'user_id');
  const messageId = strField(input, 'messageId', 'message_id');
  const content = strField(input, 'newMessage', 'message', 'content');
  if (!userId || !messageId || !content) {
    return json({ error: 'userId, messageId, and newMessage are required' });
  }
  const dm = await resolveDmChannel(ctx, userId);
  const message = await dm.messages.fetch(messageId);
  const edited = await message.edit({ content: content.slice(0, 2000) });
  return json({ ok: true, message: serializeMessage(edited) });
}

async function deletePrivateMessage(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const userId = strField(input, 'userId', 'user_id');
  const messageId = strField(input, 'messageId', 'message_id');
  if (!userId || !messageId) {
    return json({ error: 'userId and messageId are required' });
  }
  const dm = await resolveDmChannel(ctx, userId);
  const message = await dm.messages.fetch(messageId);
  await message.delete();
  return json({ ok: true, id: messageId });
}

async function readPrivateMessages(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const userId = strField(input, 'userId', 'user_id');
  if (!userId) return json({ error: 'userId is required' });
  const dm = await resolveDmChannel(ctx, userId);
  const page = await fetchMessagePage(dm, input);
  if ('error' in page) return json(page);
  return json({ userId, count: page.messages.length, messages: page.messages });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'get_user_id_by_name',
      "Get a Discord user's ID by username in a guild. Use the id in later tools. Do not ping unless the operator asked for a ping.",
      {
        username: {
          type: 'string',
          description: 'Discord username (optionally username#discriminator)'
        },
        guildId: { type: 'string', description: 'Discord server ID' }
      },
      ['username']
    ),
    run: getUserIdByName
  },
  {
    spec: defineTool(
      'send_private_message',
      'Send a private message to a specific user',
      {
        userId: { type: 'string', description: 'Discord user ID' },
        message: { type: 'string', description: 'Message content' }
      },
      ['userId', 'message']
    ),
    run: sendPrivateMessage
  },
  {
    spec: defineTool(
      'edit_private_message',
      'Edit a private message from a specific user',
      {
        userId: { type: 'string', description: 'Discord user ID' },
        messageId: { type: 'string', description: 'Message ID' },
        newMessage: { type: 'string', description: 'New message content' }
      },
      ['userId', 'messageId', 'newMessage']
    ),
    run: editPrivateMessage
  },
  {
    spec: defineTool(
      'delete_private_message',
      'Delete a private message from a specific user',
      {
        userId: { type: 'string', description: 'Discord user ID' },
        messageId: { type: 'string', description: 'Message ID' }
      },
      ['userId', 'messageId']
    ),
    run: deletePrivateMessage
  },
  {
    spec: defineTool(
      'read_private_messages',
      'Read private message history from a specific user, optionally paginated with before/after/around',
      {
        userId: { type: 'string', description: 'Discord user ID' },
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
      ['userId']
    ),
    run: readPrivateMessages
  }
];
