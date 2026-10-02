export function buildAgentUserTurn(input: {
  guildLabel: string;
  channelLabel: string;
  mentionedChannels: string[];
  repliedMessageContent: string | null;
  attachedImages?: string[];
  skippedAttachments?: string[];
  userText: string;
}): string {
  const lines = [
    '[context]',
    `guild: ${input.guildLabel}`,
    `channel: ${input.channelLabel}`,
    input.mentionedChannels.length > 0
      ? `mentioned_channels: ${input.mentionedChannels.join(', ')}`
      : 'mentioned_channels: none'
  ];
  if (input.repliedMessageContent !== null) {
    lines.push(`replied_message_content: ${input.repliedMessageContent}`);
  }
  if (input.attachedImages && input.attachedImages.length > 0) {
    lines.push(`attached_images: ${input.attachedImages.join(', ')}`);
  }
  if (input.skippedAttachments && input.skippedAttachments.length > 0) {
    lines.push(`skipped_attachments: ${input.skippedAttachments.join(', ')}`);
  }
  lines.push('[/context]', '', input.userText);
  return lines.join('\n');
}
