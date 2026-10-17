import { type GuildChannel, OverwriteType } from 'discord.js';
import {
  parseOverwriteUpdate,
  parsePermissionCsv,
  permissionPatchFromBitfield
} from '@/agent/permissions';
import {
  type AgentTool,
  auditReason,
  defineTool,
  json,
  resolveGuildChannel,
  serializeChannelSummary,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

function asOverwriteChannel(
  channel: Awaited<ReturnType<typeof resolveGuildChannel>>
) {
  if (!channel) return null;
  if (channel.isThread()) return channel.parent ?? null;
  if ('permissionOverwrites' in channel) return channel;
  return null;
}

function serializeOverwrites(channel: GuildChannel) {
  return [...channel.permissionOverwrites.cache.values()].map((entry) => {
    const role = channel.guild.roles.cache.get(entry.id);
    const member = channel.guild.members.cache.get(entry.id);
    return {
      id: entry.id,
      type: entry.type === OverwriteType.Member ? 'member' : 'role',
      name:
        entry.id === channel.guild.id
          ? '@everyone'
          : (role?.name ?? member?.user.username ?? entry.id),
      allow: entry.allow.toArray(),
      deny: entry.deny.toArray()
    };
  });
}

async function listOverwrites(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id') ?? ctx.channelId;
  const channel = await resolveGuildChannel(ctx, channelId);
  const overwriteChannel = asOverwriteChannel(channel);
  if (!overwriteChannel) {
    return json({
      error: `Channel ${channelId} not found or has no overwrites`
    });
  }
  return json({
    channel: serializeChannelSummary(overwriteChannel),
    overwrites: serializeOverwrites(overwriteChannel)
  });
}

async function upsertOverwrite(
  input: Record<string, unknown>,
  ctx: ToolContext,
  targetKey: 'roleId' | 'userId'
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const targetId = strField(input, targetKey, 'targetId', 'target_id');
  if (!channelId || !targetId) {
    return json({ error: 'channelId and target id are required' });
  }
  const channel = await resolveGuildChannel(ctx, channelId);
  const overwriteChannel = asOverwriteChannel(channel);
  if (!overwriteChannel) {
    return json({ error: 'This channel type has no permission overwrites' });
  }

  const allowCsv = strField(input, 'allowPermissions', 'allow');
  const denyCsv = strField(input, 'denyPermissions', 'deny');
  const allowRaw = strField(input, 'allowRaw');
  const denyRaw = strField(input, 'denyRaw');

  const patch: Record<string, boolean | null> = {};
  if (allowRaw !== undefined || denyRaw !== undefined) {
    const fromBits = permissionPatchFromBitfield(allowRaw, denyRaw);
    if ('error' in fromBits) return json(fromBits);
    Object.assign(patch, fromBits);
  }
  const allowNames = parsePermissionCsv(allowCsv);
  const denyNames = parsePermissionCsv(denyCsv);
  const unknown = [...allowNames.unknown, ...denyNames.unknown];
  if (unknown.length > 0) {
    return json({ error: 'Unknown permission names', unknown });
  }
  for (const name of allowNames.names) patch[name] = true;
  for (const name of denyNames.names) patch[name] = false;

  if (Object.keys(patch).length === 0) {
    const named = parseOverwriteUpdate({
      allow: allowCsv ? allowCsv.split(',') : undefined,
      deny: denyCsv ? denyCsv.split(',') : undefined
    });
    if (named.unknown.length === 0) Object.assign(patch, named.patch);
  }

  if (Object.keys(patch).length === 0) {
    return json({
      error: 'Provide allowPermissions, denyPermissions, allowRaw, or denyRaw'
    });
  }

  await overwriteChannel.permissionOverwrites.edit(targetId, patch, {
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({
    ok: true,
    channel: serializeChannelSummary(overwriteChannel),
    targetId,
    patch
  });
}

async function upsertRole(input: Record<string, unknown>, ctx: ToolContext) {
  return upsertOverwrite(input, ctx, 'roleId');
}

async function upsertMember(input: Record<string, unknown>, ctx: ToolContext) {
  return upsertOverwrite(input, ctx, 'userId');
}

async function deleteOverwrite(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const targetId = strField(input, 'targetId', 'target_id', 'roleId', 'userId');
  if (!channelId || !targetId) {
    return json({ error: 'channelId and targetId are required' });
  }
  const channel = await resolveGuildChannel(ctx, channelId);
  const overwriteChannel = asOverwriteChannel(channel);
  if (!overwriteChannel) {
    return json({ error: 'This channel type has no permission overwrites' });
  }
  await overwriteChannel.permissionOverwrites.delete(
    targetId,
    auditReason(ctx, strField(input, 'reason'))
  );
  return json({
    ok: true,
    action: 'cleared',
    channel: serializeChannelSummary(overwriteChannel),
    targetId
  });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'list_channel_permission_overwrites',
      'Returns all permission overwrites for a channel with role/member breakdown and allow/deny details',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Channel ID' }
      },
      ['channelId']
    ),
    run: listOverwrites
  },
  {
    spec: defineTool(
      'upsert_role_channel_permissions',
      'Creates or updates permission overwrite for a role on a channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Channel ID' },
        roleId: { type: 'string', description: 'Role ID' },
        allowRaw: {
          type: 'string',
          description: 'Allow permissions raw bitfield'
        },
        denyRaw: {
          type: 'string',
          description: 'Deny permissions raw bitfield'
        },
        allowPermissions: {
          type: 'string',
          description:
            'Allow permissions as CSV of names (e.g. ViewChannel,SendMessages)'
        },
        denyPermissions: {
          type: 'string',
          description: 'Deny permissions as CSV of names'
        },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['channelId', 'roleId']
    ),
    run: upsertRole
  },
  {
    spec: defineTool(
      'upsert_member_channel_permissions',
      'Creates or updates permission overwrite for a member on a channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Channel ID' },
        userId: { type: 'string', description: 'User ID' },
        allowRaw: {
          type: 'string',
          description: 'Allow permissions raw bitfield'
        },
        denyRaw: {
          type: 'string',
          description: 'Deny permissions raw bitfield'
        },
        allowPermissions: {
          type: 'string',
          description: 'Allow permissions as CSV of names'
        },
        denyPermissions: {
          type: 'string',
          description: 'Deny permissions as CSV of names'
        },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['channelId', 'userId']
    ),
    run: upsertMember
  },
  {
    spec: defineTool(
      'delete_channel_permission_overwrite',
      'Deletes a permission overwrite for a role or member from a channel',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        channelId: { type: 'string', description: 'Channel ID' },
        targetType: {
          type: 'string',
          description: "Target type: 'role' or 'member'"
        },
        targetId: { type: 'string', description: 'Target role or user ID' },
        reason: { type: 'string', description: 'Reason for audit log' }
      },
      ['channelId', 'targetId']
    ),
    run: deleteOverwrite
  }
];
