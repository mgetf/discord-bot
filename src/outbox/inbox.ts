import type { InboxMessage } from '@/utils/api';

type DirectMessageLike = {
  id: string;
  content: string;
  author: { id: string; username: string };
  attachments: Array<{ name: string; url: string }>;
  replyToMessageId: string | null;
};

const MAX_CONTENT = 4000;

/** The site's view of a DM. Null when there is nothing worth forwarding. */
export const inboxMessageFrom = (
  message: DirectMessageLike
): InboxMessage | null => {
  const content = message.content.trim();
  if (content.length === 0 && message.attachments.length === 0) return null;
  return {
    discordMessageId: message.id,
    discordUserId: message.author.id,
    discordUsername: message.author.username,
    content: content.slice(0, MAX_CONTENT),
    attachments: message.attachments.slice(0, 10),
    replyToMessageId: message.replyToMessageId
  };
};
