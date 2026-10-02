import { Events, type Message } from 'discord.js';
import { isAllowedAgentUser } from '@/agent/allowlist';
import { runAgentTurn } from '@/agent/run';
import { getOrCreateSession } from '@/agent/sessions';
import { splitDiscordContent } from '@/agent/split-message';
import { shouldHandleAgentMessage } from '@/agent/trigger';
import { env } from '@/env';
import type { Event } from '@/types';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'events/message-create' });

export const event: Event<Events.MessageCreate> = {
  name: Events.MessageCreate,
  execute: async (message) => {
    if (!message.inGuild()) return;
    const botId = message.client.user?.id;
    if (!botId) return;

    const referenced = await fetchReferencedMessage(message);
    const replyToBot = referenced?.author.id === botId;
    if (
      !shouldHandleAgentMessage({
        authorBot: message.author.bot,
        inGuild: true,
        allowed: isAllowedAgentUser(message.author.id),
        agentConfigured: Boolean(env.ANTHROPIC_API_KEY),
        mentionedBot: message.mentions.users.has(botId),
        replyToBot
      })
    ) {
      return;
    }

    const guild = message.guild;
    if (!guild) return;
    if (!message.channel.isSendable()) return;

    const session = getOrCreateSession(message.channelId, message.author.id);
    if (session.busy) {
      await message.react('⏳').catch(() => undefined);
      return;
    }

    session.busy = true;
    const typing = startTyping(message);
    let status: Message<true> | null = null;

    try {
      status = await message.reply({
        content: 'Dame un segundo…',
        allowedMentions: { parse: [] }
      });

      const answer = await runAgentTurn({
        session,
        message,
        guild,
        repliedMessageContent: referenced ? referenced.content : null
      });
      const chunks = splitDiscordContent(answer);
      const first = chunks[0] ?? '(sin texto)';
      await status.edit({ content: first });

      for (const chunk of chunks.slice(1)) {
        await message.channel.send({
          content: chunk,
          allowedMentions: { parse: [] }
        });
      }
    } catch (err) {
      log.error({ err, userId: message.author.id }, 'Agent turn failed');
      const errorText =
        'No pude completar eso. Revisá el log del bot o pedime de nuevo.';
      if (status) {
        await status.edit({ content: errorText }).catch(() => undefined);
      } else {
        await message.reply({ content: errorText }).catch(() => undefined);
      }
    } finally {
      session.busy = false;
      session.updatedAt = Date.now();
      stopTyping(typing);
    }
  }
};

async function fetchReferencedMessage(
  message: Message<true>
): Promise<Message | null> {
  if (!message.reference?.messageId) return null;
  try {
    return await message.fetchReference();
  } catch {
    return null;
  }
}

function startTyping(message: Message<true>): ReturnType<typeof setInterval> {
  void message.channel.sendTyping().catch(() => undefined);
  return setInterval(() => {
    void message.channel.sendTyping().catch(() => undefined);
  }, 8000);
}

function stopTyping(timer: ReturnType<typeof setInterval>): void {
  clearInterval(timer);
}
