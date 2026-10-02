export const AGENT_ALLOWED_MENTIONS = {
  parse: [] as [],
  users: [] as string[],
  roles: [] as string[],
  repliedUser: false
};

export function neutralizeDiscordMentions(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, '@\u200b$1')
    .replace(/<@&(\d+)>/g, '`role:$1`')
    .replace(/<@!?(\d+)>/g, '`user:$1`');
}
