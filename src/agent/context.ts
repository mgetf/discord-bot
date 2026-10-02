export function buildAgentUserTurn(input: {
  guildLabel: string;
  channelLabel: string;
  mentionedChannels: string[];
  repliedMessageContent: string | null;
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
  lines.push('[/context]', '', input.userText);
  return lines.join('\n');
}
