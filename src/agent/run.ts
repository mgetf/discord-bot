import Anthropic from '@anthropic-ai/sdk';
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { Guild, Message } from 'discord.js';
import { buildAgentUserTurn } from '@/agent/context';
import { AGENT_TOOLS, executeAgentTool } from '@/agent/discord-tools';
import { type AgentSession, pruneAgentMessages } from '@/agent/sessions';
import { env } from '@/env';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'agent/run' });
const MAX_STEPS = 8;

export async function runAgentTurn(input: {
  session: AgentSession;
  message: Message<true>;
  guild: Guild;
  repliedMessageContent?: string | null;
}): Promise<string> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const client = new Anthropic({ apiKey });
  const userText = buildUserTurn(
    input.message,
    input.repliedMessageContent ?? null
  );
  input.session.messages.push({ role: 'user', content: userText });
  input.session.messages = pruneAgentMessages(input.session.messages);

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: env.AGENT_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      messages: input.session.messages
    });

    input.session.messages.push({
      role: 'assistant',
      content: response.content
    });

    const toolUses = response.content.filter(
      (block) => block.type === 'tool_use'
    );
    if (toolUses.length === 0) {
      const text = textFrom(response.content);
      return text.length > 0 ? text : 'Listo. No tengo nada más para agregar.';
    }

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      if (block.type !== 'tool_use') continue;
      log.info({ tool: block.name, step }, 'Agent tool call');
      const output = await executeAgentTool(block.name, asRecord(block.input), {
        guild: input.guild,
        channelId: input.message.channelId,
        requesterTag: input.message.author.tag
      });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: output
      });
    }

    input.session.messages.push({ role: 'user', content: toolResults });
    input.session.messages = pruneAgentMessages(input.session.messages);
  }

  return 'Se me acabaron los pasos de esta vuelta. Pedime de nuevo lo que falte.';
}

const SYSTEM_PROMPT = `You are the official mge.tf Discord ops assistant. You run as the guild bot.

This conversation is public. Other people in the channel can read your replies. Be concise.

You inspect and fix Discord channel permission overwrites. Staff-only announcement channels typically deny @everyone SendMessages, SendMessagesInThreads, CreatePublicThreads, and CreatePrivateThreads. Roles that should post (Admin, Owner, founder, Discord Manager, etc.) get those permissions allowed.

Do not invent channel or role IDs. Use the tools. Prefer IDs from the turn context and from tool results.

Do not dump tokens, secrets, or full bitfields. Summarize what was wrong and what you changed.

Match the user's language.`;

function buildUserTurn(
  message: Message<true>,
  repliedMessageContent: string | null
): string {
  const mentioned = [...message.mentions.channels.values()].map(
    (channel) =>
      `#${'name' in channel ? channel.name : channel.id} (${channel.id})`
  );
  return buildAgentUserTurn({
    guildLabel: `${message.guild.name} (${message.guild.id})`,
    channelLabel: `#${'name' in message.channel ? message.channel.name : message.channelId} (${message.channelId}) type=${message.channel.type}`,
    mentionedChannels: mentioned,
    repliedMessageContent,
    userText: stripBotMention(message)
  });
}

function stripBotMention(message: Message<true>): string {
  const botId = message.client.user?.id;
  if (!botId) return message.content.trim();
  return message.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
}

function textFrom(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}
