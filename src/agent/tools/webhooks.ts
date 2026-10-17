import { WebhookClient } from 'discord.js';
import {
  type AgentTool,
  auditReason,
  defineTool,
  json,
  resolveGuildChannel,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

function serializeWebhook(hook: {
  id: string;
  name: string | null;
  channelId: string | null;
  applicationId: string | null;
}) {
  return {
    id: hook.id,
    name: hook.name,
    channelId: hook.channelId,
    applicationId: hook.applicationId
  };
}

function parseWebhookUrl(url: string): { id: string; token: string } | null {
  const match = url.match(/webhooks\/(\d+)\/([A-Za-z0-9_-]+)/);
  if (!match?.[1] || !match[2]) return null;
  return { id: match[1], token: match[2] };
}

async function createWebhook(input: Record<string, unknown>, ctx: ToolContext) {
  const channelId = strField(input, 'channelId', 'channel_id');
  const name = strField(input, 'name');
  if (!channelId || !name) {
    return json({ error: 'channelId and name are required' });
  }
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel || !('createWebhook' in channel)) {
    return json({ error: `Channel ${channelId} cannot host webhooks` });
  }
  const hook = await channel.createWebhook({
    name,
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, webhook: serializeWebhook(hook) });
}

async function listWebhooks(input: Record<string, unknown>, ctx: ToolContext) {
  const channelId = strField(input, 'channelId', 'channel_id');
  if (!channelId) return json({ error: 'channelId is required' });
  const channel = await resolveGuildChannel(ctx, channelId);
  if (!channel || !('fetchWebhooks' in channel)) {
    return json({ error: `Channel ${channelId} cannot host webhooks` });
  }
  const hooks = await channel.fetchWebhooks();
  return json({
    count: hooks.size,
    webhooks: [...hooks.values()].map((hook) => serializeWebhook(hook))
  });
}

async function deleteWebhook(input: Record<string, unknown>, ctx: ToolContext) {
  const webhookId = strField(input, 'webhookId', 'webhook_id');
  if (!webhookId) return json({ error: 'webhookId is required' });
  const hooks = await ctx.guild.fetchWebhooks();
  const hook = hooks.get(webhookId);
  if (!hook)
    return json({ error: `Webhook ${webhookId} not found on this server` });
  await hook.delete(auditReason(ctx, strField(input, 'reason')));
  return json({ ok: true, id: webhookId });
}

async function sendWebhookMessage(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const content = strField(input, 'message', 'content');
  if (!content) return json({ error: 'message is required' });
  const webhookUrl = strField(input, 'webhookUrl', 'webhook_url');
  const webhookId = strField(input, 'webhookId', 'webhook_id');

  if (webhookUrl) {
    const parsed = parseWebhookUrl(webhookUrl);
    if (!parsed) return json({ error: 'Invalid webhook URL' });
    const hook = await ctx.guild.client.fetchWebhook(parsed.id, parsed.token);
    if (hook.guildId && hook.guildId !== ctx.guild.id) {
      return json({ error: 'Webhook belongs to another server' });
    }
    const client = new WebhookClient({ id: parsed.id, token: parsed.token });
    try {
      const sent = await client.send({ content: content.slice(0, 2000) });
      return json({
        ok: true,
        id: sent.id,
        channelId: 'channelId' in sent ? sent.channelId : sent.channel_id
      });
    } finally {
      client.destroy();
    }
  }

  if (!webhookId) return json({ error: 'webhookUrl or webhookId is required' });
  const hooks = await ctx.guild.fetchWebhooks();
  const hook = hooks.get(webhookId);
  if (!hook)
    return json({ error: `Webhook ${webhookId} not found on this server` });
  const sent = await hook.send({ content: content.slice(0, 2000) });
  return json({ ok: true, id: sent.id, channelId: sent.channelId });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'create_webhook',
      'Create a new webhook on a specific channel',
      {
        channelId: { type: 'string', description: 'Discord channel ID' },
        name: { type: 'string', description: 'Webhook name' }
      },
      ['channelId', 'name']
    ),
    run: createWebhook
  },
  {
    spec: defineTool(
      'list_webhooks',
      'List of webhooks on a specific channel. Tokens are never returned.',
      {
        channelId: { type: 'string', description: 'Discord channel ID' }
      },
      ['channelId']
    ),
    run: listWebhooks
  },
  {
    spec: defineTool(
      'delete_webhook',
      'Delete a webhook',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        webhookId: { type: 'string', description: 'Webhook ID' }
      },
      ['webhookId']
    ),
    run: deleteWebhook
  },
  {
    spec: defineTool(
      'send_webhook_message',
      'Send a message via webhook. Prefer a webhookId from this server. Tokens stay out of results.',
      {
        webhookUrl: { type: 'string', description: 'Discord webhook link' },
        webhookId: {
          type: 'string',
          description: 'Webhook ID on this server (preferred over webhookUrl)'
        },
        message: { type: 'string', description: 'Message content' }
      },
      ['message']
    ),
    run: sendWebhookMessage
  }
];
