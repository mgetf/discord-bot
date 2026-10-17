import {
  type AgentTool,
  auditReason,
  defineTool,
  intField,
  json,
  rawStrField,
  resolveMember,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

async function kickMember(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  if (!userId) return json({ error: 'userId is required' });
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  await member.kick(auditReason(ctx, strField(input, 'reason')));
  return json({ ok: true, userId: member.id, username: member.user.username });
}

async function banMember(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  if (!userId) return json({ error: 'userId is required' });
  const deleteMessageSeconds = intField(
    input,
    'deleteMessageSeconds',
    'delete_message_seconds'
  );
  await ctx.guild.members.ban(userId, {
    reason: auditReason(ctx, strField(input, 'reason')),
    deleteMessageSeconds: deleteMessageSeconds
      ? Math.min(Math.max(deleteMessageSeconds, 0), 604800)
      : undefined
  });
  return json({ ok: true, userId });
}

async function unbanMember(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  if (!userId) return json({ error: 'userId is required' });
  await ctx.guild.bans.remove(
    userId,
    auditReason(ctx, strField(input, 'reason'))
  );
  return json({ ok: true, userId });
}

async function timeoutMember(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  const durationSeconds = intField(
    input,
    'durationSeconds',
    'duration_seconds'
  );
  if (!userId) return json({ error: 'userId is required' });
  if (durationSeconds === undefined) {
    return json({ error: 'durationSeconds is required' });
  }
  if (durationSeconds < 1 || durationSeconds > 2_419_200) {
    return json({
      error: 'durationSeconds must be between 1 and 2419200 (28 days)'
    });
  }
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  await member.timeout(
    durationSeconds * 1000,
    auditReason(ctx, strField(input, 'reason'))
  );
  return json({
    ok: true,
    userId: member.id,
    until: new Date(Date.now() + durationSeconds * 1000).toISOString()
  });
}

async function removeTimeout(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  if (!userId) return json({ error: 'userId is required' });
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  await member.timeout(null, auditReason(ctx, strField(input, 'reason')));
  return json({ ok: true, userId: member.id });
}

async function setNickname(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  if (!userId) return json({ error: 'userId is required' });
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  const nick = rawStrField(input, 'nick', 'nickname');
  await member.setNickname(
    nick === undefined || nick.length === 0 ? null : nick,
    auditReason(ctx, strField(input, 'reason'))
  );
  return json({
    ok: true,
    userId: member.id,
    nick: nick === undefined || nick.length === 0 ? null : nick
  });
}

async function getBans(input: Record<string, unknown>, ctx: ToolContext) {
  const limit = intField(input, 'limit') ?? 50;
  const bans = await ctx.guild.bans.fetch();
  const rows = [...bans.values()]
    .slice(0, Math.min(Math.max(limit, 1), 1000))
    .map((ban) => ({
      userId: ban.user.id,
      username: ban.user.username,
      reason: ban.reason
    }));
  return json({ count: rows.length, total: bans.size, bans: rows });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'kick_member',
      'Kicks a member from the server. The user can rejoin with a new invite.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: { type: 'string', description: 'ID of the user to kick' },
        reason: {
          type: 'string',
          description: 'Reason for kicking (visible in audit log)'
        }
      },
      ['userId']
    ),
    run: kickMember
  },
  {
    spec: defineTool(
      'ban_member',
      'Bans a user from the server, preventing them from rejoining. Optionally deletes their recent messages.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: { type: 'string', description: 'ID of the user to ban' },
        deleteMessageSeconds: {
          type: 'string',
          description:
            'Duration in seconds for which to delete the user messages (max 604800 = 7 days). 0 = no deletion.'
        },
        reason: {
          type: 'string',
          description: 'Reason for the ban (visible in audit log)'
        }
      },
      ['userId']
    ),
    run: banMember
  },
  {
    spec: defineTool(
      'unban_member',
      'Removes a ban from a user, allowing them to rejoin the server.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: { type: 'string', description: 'ID of the user to unban' },
        reason: {
          type: 'string',
          description: 'Reason for removing the ban (visible in audit log)'
        }
      },
      ['userId']
    ),
    run: unbanMember
  },
  {
    spec: defineTool(
      'timeout_member',
      'Disables communication for a member for a specified duration (Timeout/Mute). Max 28 days.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: { type: 'string', description: 'ID of the member to timeout' },
        durationSeconds: {
          type: 'string',
          description:
            'Duration of the timeout in seconds (max 2419200 = 28 days)'
        },
        reason: {
          type: 'string',
          description: 'Reason for the timeout (visible in audit log)'
        }
      },
      ['userId', 'durationSeconds']
    ),
    run: timeoutMember
  },
  {
    spec: defineTool(
      'remove_timeout',
      'Removes a timeout (unmute) from a member before it expires.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: {
          type: 'string',
          description: 'ID of the member to remove timeout from'
        },
        reason: {
          type: 'string',
          description: 'Reason for removing the timeout (visible in audit log)'
        }
      },
      ['userId']
    ),
    run: removeTimeout
  },
  {
    spec: defineTool(
      'set_nickname',
      'Changes a member nickname on the server. Pass empty nick to reset to original username.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: { type: 'string', description: 'ID of the user' },
        nick: {
          type: 'string',
          description: 'New nickname. Empty to reset to original username.'
        },
        reason: {
          type: 'string',
          description: 'Reason for the nickname change (visible in audit log)'
        }
      },
      ['userId']
    ),
    run: setNickname
  },
  {
    spec: defineTool(
      'get_bans',
      'Returns a list of banned users on the server with ban reasons.',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        limit: {
          type: 'string',
          description: 'Maximum number of results to return (default 50)'
        }
      }
    ),
    run: getBans
  }
];
