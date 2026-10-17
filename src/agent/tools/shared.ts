import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import {
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  type Message,
  type TextBasedChannel
} from 'discord.js';

export type ToolContext = {
  guild: Guild;
  channelId: string;
  requesterTag: string;
};

export type AgentToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext
) => Promise<string>;

export type AgentTool = {
  spec: Tool;
  run: AgentToolHandler;
};

export const MESSAGE_CONTENT_MAX = 400;

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function defineTool(
  name: string,
  description: string,
  properties: Record<string, { type: 'string'; description: string }>,
  required: string[] = []
): Tool {
  return {
    name,
    description,
    input_schema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {})
    }
  };
}

export function strField(
  input: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }
  return undefined;
}

export function rawStrField(
  input: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

export function intField(
  input: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    const n = typeof value === 'number' ? value : Number(String(value));
    if (!Number.isFinite(n)) continue;
    return Math.trunc(n);
  }
  return undefined;
}

export function boolField(
  input: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (['true', '1', 'yes'].includes(lower)) return true;
      if (['false', '0', 'no'].includes(lower)) return false;
    }
  }
  return undefined;
}

export function csvField(
  input: Record<string, unknown>,
  ...keys: string[]
): string[] | undefined {
  const raw = strField(input, ...keys);
  if (raw === undefined) return undefined;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseCount(
  value: unknown,
  fallback = 10
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: fallback };
  }
  const n = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isFinite(n))
    return { ok: false, error: 'count must be a number' };
  const i = Math.trunc(n);
  if (i < 1 || i > 100) {
    return { ok: false, error: 'count must be between 1 and 100' };
  }
  return { ok: true, value: i };
}

export function clipText(text: string, max = MESSAGE_CONTENT_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function rejectForeignGuild(
  ctx: ToolContext,
  input: Record<string, unknown>
): string | undefined {
  const id = strField(input, 'guildId', 'guild_id');
  if (id && id !== ctx.guild.id) {
    return json({
      error: `Refusing action on another guild (${id}). This conversation is in ${ctx.guild.name} (${ctx.guild.id}).`
    });
  }
  return undefined;
}

export function auditReason(ctx: ToolContext, extra?: string): string {
  const base = `AI agent for ${ctx.requesterTag}`;
  if (!extra || extra.trim().length === 0) return base.slice(0, 512);
  return `${base}: ${extra.trim()}`.slice(0, 512);
}

export function channelTypeName(type: ChannelType | number): string {
  return ChannelType[type] ?? String(type);
}

export function serializeChannelSummary(channel: {
  id: string;
  name: string;
  type: ChannelType;
  parent: { id: string; name: string } | null;
}) {
  return {
    id: channel.id,
    name: channel.name,
    type: channelTypeName(channel.type),
    parent: channel.parent
      ? { id: channel.parent.id, name: channel.parent.name }
      : null
  };
}

export function serializeMessage(message: Message) {
  return {
    id: message.id,
    author: {
      id: message.author.id,
      username: message.author.username,
      bot: message.author.bot
    },
    content: clipText(message.content),
    timestamp: message.createdAt.toISOString(),
    attachments: [...message.attachments.values()].map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      url: item.url,
      contentType: item.contentType
    })),
    replyTo: message.reference?.messageId ?? null
  };
}

export async function resolveGuildChannel(
  ctx: ToolContext,
  channelId: string
): Promise<GuildBasedChannel | null> {
  return (
    ctx.guild.channels.cache.get(channelId) ??
    (await ctx.guild.channels.fetch(channelId).catch(() => null))
  );
}

export async function resolveTextChannel(
  ctx: ToolContext,
  channelId: string
): Promise<TextBasedChannel | { error: string }> {
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel) return { error: `Channel ${channelId} not found` };
  if (!channel.isTextBased()) {
    return { error: `Channel ${channelId} is not a text channel` };
  }
  return channel;
}

export async function resolveMember(ctx: ToolContext, userId: string) {
  return (
    ctx.guild.members.cache.get(userId) ??
    (await ctx.guild.members.fetch(userId).catch(() => null))
  );
}

export async function resolveRole(ctx: ToolContext, roleId: string) {
  return (
    ctx.guild.roles.cache.get(roleId) ??
    (await ctx.guild.roles.fetch(roleId).catch(() => null))
  );
}

export async function fetchMessagePage(
  channel: TextBasedChannel,
  input: Record<string, unknown>
): Promise<
  { messages: ReturnType<typeof serializeMessage>[] } | { error: string }
> {
  const count = parseCount(input.count ?? input.limit, 10);
  if (!count.ok) return { error: count.error };

  const before = strField(input, 'before');
  const after = strField(input, 'after');
  const around = strField(input, 'around');
  const cursors = [before, after, around].filter(Boolean);
  if (cursors.length > 1) {
    return { error: 'Use only one of before, after, or around' };
  }

  const fetched = await channel.messages.fetch({
    limit: count.value,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(around ? { around } : {})
  });

  const messages = [...fetched.values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => serializeMessage(message));
  return { messages };
}

export function summarizeArgs(
  input: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('token') ||
      lower.includes('webhookurl') ||
      lower.includes('image')
    ) {
      out[key] =
        typeof value === 'string' ? `[${value.length} chars]` : '[redacted]';
      continue;
    }
    if (typeof value === 'string' && value.length > 80) {
      out[key] = `${value.slice(0, 80)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}
