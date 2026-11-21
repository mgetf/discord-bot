import { ChannelType, Events } from 'discord.js';
import { inboxMessageFrom } from '@/outbox/inbox';
import type { Event } from '@/types';
import { mgeApi } from '@/utils/api';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'events/direct-message' });

/**
 * Forwards DMs sent to the bot (including replies to its notifications) to
 * mge.tf, where admins read them on the Discord tab. Guild messages are
 * handled by the agent, not here.
 */
export const event: Event<Events.MessageCreate> = {
  name: Events.MessageCreate,
  execute: async (message) => {
    if (message.inGuild() || message.author.bot) return;
    if (message.channel.type !== ChannelType.DM) return;

    try {
      const full = message.partial ? await message.fetch() : message;
      const forwarded = inboxMessageFrom({
        id: full.id,
        content: full.content,
        author: { id: full.author.id, username: full.author.username },
        attachments: [...full.attachments.values()].map((a) => ({
          name: a.name,
          url: a.url
        })),
        replyToMessageId: full.reference?.messageId ?? null
      });
      if (!forwarded) return;

      await mgeApi.postInbox(forwarded);
      // A reaction says "received" without starting a conversation.
      await full.react('✅').catch(() => undefined);
    } catch (err) {
      log.error({ err, userId: message.author.id }, 'Failed to forward DM');
    }
  }
};
