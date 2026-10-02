export const EDITABLE_PERMISSIONS = [
  'ViewChannel',
  'SendMessages',
  'SendMessagesInThreads',
  'CreatePublicThreads',
  'CreatePrivateThreads',
  'EmbedLinks',
  'AttachFiles',
  'AddReactions',
  'MentionEveryone',
  'UseExternalEmojis',
  'UseExternalStickers',
  'SendTTSMessages',
  'ReadMessageHistory'
] as const;

export type EditablePermission = (typeof EDITABLE_PERMISSIONS)[number];

const EDITABLE = new Set<string>(EDITABLE_PERMISSIONS);

export function parseOverwriteUpdate(input: {
  allow?: string[];
  deny?: string[];
  unset?: string[];
}): { patch: Record<string, boolean | null>; unknown: string[] } {
  const patch: Record<string, boolean | null> = {};
  const unknown: string[] = [];

  const apply = (names: string[] | undefined, value: boolean | null) => {
    if (!names) return;
    for (const raw of names) {
      const name = raw.trim();
      if (!EDITABLE.has(name)) {
        unknown.push(name);
        continue;
      }
      patch[name] = value;
    }
  };

  apply(input.allow, true);
  apply(input.deny, false);
  apply(input.unset, null);
  return { patch, unknown };
}
