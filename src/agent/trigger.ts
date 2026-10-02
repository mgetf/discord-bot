export function shouldHandleAgentMessage(input: {
  authorBot: boolean;
  inGuild: boolean;
  allowed: boolean;
  agentConfigured: boolean;
  mentionedBot: boolean;
  replyToBot: boolean;
}): boolean {
  if (
    input.authorBot ||
    !input.inGuild ||
    !input.allowed ||
    !input.agentConfigured
  ) {
    return false;
  }
  return input.mentionedBot || input.replyToBot;
}
