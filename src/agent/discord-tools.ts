import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import {
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  type GuildChannel,
  OverwriteType,
  PermissionFlagsBits
} from 'discord.js';
import {
  EDITABLE_PERMISSIONS,
  parseOverwriteUpdate
} from '@/agent/permissions';

export type ToolContext = {
  guild: Guild;
  channelId: string;
  requesterTag: string;
};

const CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum
]);

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'find_channels',
    description:
      'Search guild channels by name substring. Use this before inspecting or editing when the user names a channel.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Case-insensitive channel name substring'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'inspect_channel',
    description:
      'Inspect a channel or thread: type, parent, topic, computed @everyone send permissions, and permission overwrites.',
    input_schema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Channel snowflake. Defaults to the current channel.'
        }
      }
    }
  },
  {
    name: 'list_roles',
    description:
      'List guild roles matching a name substring. Omit query to list common staff roles (Admin, Owner, founder, Moderator, Manager).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Case-insensitive role name substring'
        }
      }
    }
  },
  {
    name: 'set_overwrite',
    description:
      'Create or edit a channel permission overwrite. Use target_id "everyone" for @everyone. allow/deny/unset take Discord permission names such as SendMessages.',
    input_schema: {
      type: 'object',
      properties: {
        channel_id: {
          type: 'string',
          description: 'Channel snowflake. Defaults to the current channel.'
        },
        target_id: {
          type: 'string',
          description: 'Role id, member id, or "everyone"'
        },
        allow: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permission names to allow'
        },
        deny: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permission names to deny'
        },
        unset: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permission names to clear from this overwrite'
        },
        clear: {
          type: 'boolean',
          description: 'Delete the entire overwrite instead of editing flags'
        }
      },
      required: ['target_id']
    }
  }
];

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case 'find_channels':
        return await findChannels(ctx, str(input.query));
      case 'inspect_channel':
        return await inspectChannel(
          ctx,
          str(input.channel_id) ?? ctx.channelId
        );
      case 'list_roles':
        return listRoles(ctx, str(input.query));
      case 'set_overwrite':
        return await setOverwrite(ctx, input);
      default:
        return json({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

async function findChannels(ctx: ToolContext, query: string | undefined) {
  if (!query || query.trim().length < 2) {
    return json({ error: 'query must be at least 2 characters' });
  }
  const needle = query.trim().toLowerCase();
  const matches = [...ctx.guild.channels.cache.values()]
    .filter((channel) => CHANNEL_TYPES.has(channel.type))
    .filter((channel) => channel.name.toLowerCase().includes(needle))
    .slice(0, 20)
    .map((channel) => serializeChannelSummary(channel));

  return json({ query, count: matches.length, channels: matches });
}

async function inspectChannel(ctx: ToolContext, channelId: string) {
  const channel = await resolveChannel(ctx.guild, channelId);
  if (!channel) return json({ error: `Channel ${channelId} not found` });

  const overwriteChannel = getOverwriteChannel(channel);
  const everyone = ctx.guild.roles.everyone;
  const computed = overwriteChannel
    ? overwriteChannel.permissionsFor(everyone)
    : null;

  const overwrites = overwriteChannel
    ? [...overwriteChannel.permissionOverwrites.cache.values()].map((entry) => {
        const role = ctx.guild.roles.cache.get(entry.id);
        const member = ctx.guild.members.cache.get(entry.id);
        return {
          id: entry.id,
          type: entry.type === OverwriteType.Member ? 'member' : 'role',
          name:
            entry.id === ctx.guild.id
              ? '@everyone'
              : (role?.name ?? member?.user.username ?? entry.id),
          allow: entry.allow.toArray(),
          deny: entry.deny.toArray()
        };
      })
    : [];

  return json({
    id: channel.id,
    name: channel.name,
    type: ChannelType[channel.type] ?? channel.type,
    parent: channel.parent
      ? { id: channel.parent.id, name: channel.parent.name }
      : null,
    topic: 'topic' in channel ? (channel.topic ?? null) : null,
    nsfw: 'nsfw' in channel ? Boolean(channel.nsfw) : false,
    overwriteTarget: overwriteChannel
      ? { id: overwriteChannel.id, name: overwriteChannel.name }
      : null,
    everyone: {
      viewChannel: computed?.has(PermissionFlagsBits.ViewChannel) ?? null,
      sendMessages: computed?.has(PermissionFlagsBits.SendMessages) ?? null,
      sendMessagesInThreads:
        computed?.has(PermissionFlagsBits.SendMessagesInThreads) ?? null,
      createPublicThreads:
        computed?.has(PermissionFlagsBits.CreatePublicThreads) ?? null
    },
    overwrites
  });
}

function listRoles(ctx: ToolContext, query: string | undefined) {
  const roles = [...ctx.guild.roles.cache.values()].sort(
    (a, b) => b.position - a.position
  );
  const needle = query?.trim().toLowerCase();
  const filtered = needle
    ? roles.filter((role) => role.name.toLowerCase().includes(needle))
    : roles.filter((role) =>
        /everyone|admin|owner|founder|mod|staff|manager|commissioner/i.test(
          role.name
        )
      );

  return json({
    query: needle ?? null,
    count: filtered.length,
    roles: filtered.slice(0, 30).map((role) => ({
      id: role.id,
      name: role.name,
      position: role.position,
      mentionable: role.mentionable,
      managed: role.managed
    }))
  });
}

async function setOverwrite(ctx: ToolContext, input: Record<string, unknown>) {
  const channelId = str(input.channel_id) ?? ctx.channelId;
  const targetIdRaw = str(input.target_id);
  if (!targetIdRaw) return json({ error: 'target_id is required' });

  const channel = await resolveChannel(ctx.guild, channelId);
  if (!channel) return json({ error: `Channel ${channelId} not found` });
  const overwriteChannel = getOverwriteChannel(channel);
  if (!overwriteChannel) {
    return json({ error: 'This channel type has no permission overwrites' });
  }

  const target = await resolveOverwriteTarget(ctx.guild, targetIdRaw);
  if (!target) {
    return json({
      error: `Could not resolve target ${targetIdRaw} as @everyone, a role, or a member`
    });
  }

  const reason = `AI agent for ${ctx.requesterTag}`;
  const clear = input.clear === true;
  if (clear) {
    await overwriteChannel.permissionOverwrites.delete(target.id, reason);
    return json({
      ok: true,
      action: 'cleared',
      channel: serializeChannelSummary(overwriteChannel),
      target
    });
  }

  const { patch, unknown } = parseOverwriteUpdate({
    allow: strArr(input.allow),
    deny: strArr(input.deny),
    unset: strArr(input.unset)
  });
  if (unknown.length > 0) {
    return json({
      error: 'Unknown or disallowed permission names',
      unknown,
      allowed: EDITABLE_PERMISSIONS
    });
  }
  if (Object.keys(patch).length === 0) {
    return json({
      error: 'Provide allow, deny, or unset permission names, or clear=true'
    });
  }

  await overwriteChannel.permissionOverwrites.edit(target.id, patch, {
    reason
  });
  return json({
    ok: true,
    action: 'edited',
    channel: serializeChannelSummary(overwriteChannel),
    target,
    patch
  });
}

async function resolveChannel(guild: Guild, channelId: string) {
  return (
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

function getOverwriteChannel(channel: GuildBasedChannel): GuildChannel | null {
  if (channel.isThread()) return channel.parent ?? null;
  if ('permissionOverwrites' in channel) return channel;
  return null;
}

async function resolveOverwriteTarget(guild: Guild, raw: string) {
  const id = raw === 'everyone' || raw === '@everyone' ? guild.id : raw.trim();

  if (id === guild.id) {
    return { id: guild.id, type: 'role' as const, name: '@everyone' };
  }

  const role =
    guild.roles.cache.get(id) ??
    (await guild.roles.fetch(id).catch(() => null));
  if (role) return { id: role.id, type: 'role' as const, name: role.name };

  const member =
    guild.members.cache.get(id) ??
    (await guild.members.fetch(id).catch(() => null));
  if (member) {
    return {
      id: member.id,
      type: 'member' as const,
      name: member.user.username
    };
  }
  return null;
}

function serializeChannelSummary(channel: {
  id: string;
  name: string;
  type: ChannelType;
  parent: { id: string; name: string } | null;
}) {
  return {
    id: channel.id,
    name: channel.name,
    type: ChannelType[channel.type] ?? channel.type,
    parent: channel.parent
      ? { id: channel.parent.id, name: channel.parent.name }
      : null
  };
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function strArr(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function json(value: unknown): string {
  return JSON.stringify(value);
}
