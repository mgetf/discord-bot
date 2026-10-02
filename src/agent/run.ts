import Anthropic from '@anthropic-ai/sdk';
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { Guild, Message } from 'discord.js';
import { buildAgentUserTurn } from '@/agent/context';
import { AGENT_TOOLS, executeAgentTool } from '@/agent/discord-tools';
import { type AgentSession, pruneAgentMessages } from '@/agent/sessions';
import { getAgentModel, getSystemPrompt } from '@/agent/settings';
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
      model: getAgentModel(),
      max_tokens: 1500,
      system: getSystemPrompt(),
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
      return text.length > 0 ? text : 'Done. Nothing else to add.';
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

  return 'I ran out of steps this turn. Ask me again for what is left.';
}

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
