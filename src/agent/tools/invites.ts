import {
  type AgentTool,
  auditReason,
  boolField,
  defineTool,
  intField,
  json,
  resolveGuildChannel,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

function serializeInvite(invite: {
  code: string;
  url: string;
  channelId: string | null;
  inviter: { id: string; username: string } | null;
  maxAge: number | null;
  maxUses: number | null;
  uses: number | null;
  temporary: boolean | null;
  expiresAt: Date | null;
}) {
  return {
    code: invite.code,
    url: invite.url,
    channelId: invite.channelId,
    inviter: invite.inviter
      ? { id: invite.inviter.id, username: invite.inviter.username }
      : null,
    maxAge: invite.maxAge,
    maxUses: invite.maxUses,
    uses: invite.uses,
    temporary: invite.temporary,
    expiresAt: invite.expiresAt?.toISOString() ?? null
  };
}

async function createInvite(input: Record<string, unknown>, ctx: ToolContext) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel || !('createInvite' in channel)) {
    return json({ error: `Channel ${channelId} cannot host invites` });
  }
  const invite = await channel.createInvite({
    maxAge: intField(input, 'maxAge', 'max_age') ?? 86400,
    maxUses: intField(input, 'maxUses', 'max_uses') ?? 0,
    temporary: boolField(input, 'temporary') ?? false,
    unique: boolField(input, 'unique') ?? true,
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, invite: serializeInvite(invite) });
}

async function listInvites(_input: Record<string, unknown>, ctx: ToolContext) {
  const invites = await ctx.guild.invites.fetch();
  const rows = [...invites.values()].map((invite) => serializeInvite(invite));
  return json({ count: rows.length, invites: rows });
}

async function deleteInvite(input: Record<string, unknown>, ctx: ToolContext) {
  const code = strField(input, 'code', 'inviteCode', 'invite_code');
  if (!code) return json({ error: 'code is required' });
  const invite = await ctx.guild.invites.fetch(code);
  if (invite.guild?.id !== ctx.guild.id) {
    return json({ error: 'Invite does not belong to this server' });
  }
  await invite.delete(auditReason(ctx, strField(input, 'reason')));
  return json({ ok: true, code });
}

async function getInviteDetails(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const code = strField(input, 'code', 'inviteCode', 'invite_code');
  if (!code) return json({ error: 'code is required' });
  const invite = await ctx.guild.client.fetchInvite(code);
  return json({
    invite: {
      ...serializeInvite(invite),
      guildId: invite.guild?.id ?? null,
      guildName:
        invite.guild && 'name' in invite.guild ? invite.guild.name : null,
      memberCount: invite.memberCount,
      presenceCount: invite.presenceCount
    }
  });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'create_invite',
      'Create a new invite link for a specific channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: {
          type: 'string',
          description: 'ID of the channel the invite directs to'
        },
        maxAge: {
          type: 'string',
          description:
            'Duration in seconds before expiry (0 = never, default 86400 = 24h)'
        },
        maxUses: {
          type: 'string',
          description: 'Max number of uses (0 = unlimited, default 0)'
        },
        temporary: {
          type: 'string',
          description:
            'Whether members get temporary membership (kicked when disconnected unless role assigned)'
        },
        unique: {
          type: 'string',
          description: 'Force creation of a new unique invite code'
        }
      },
      ['channelId']
    ),
    run: createInvite
  },
  {
    spec: defineTool(
      'list_invites',
      'List all active invites on the server with their statistics',
      {
        guildId: { type: 'string', description: 'Discord server ID' }
      }
    ),
    run: listInvites
  },
  {
    spec: defineTool(
      'delete_invite',
      'Delete (revoke) an invite so the link stops working',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        code: { type: 'string', description: 'Invite code to revoke' }
      },
      ['code']
    ),
    run: deleteInvite
  },
  {
    spec: defineTool(
      'get_invite_details',
      'Get details about a specific invite (works for any public invite)',
      {
        code: { type: 'string', description: 'Invite code' }
      },
      ['code']
    ),
    run: getInviteDetails
  }
];
