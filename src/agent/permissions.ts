import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';

const FLAG_NAMES = Object.keys(PermissionFlagsBits).filter((name) =>
  Number.isNaN(Number(name))
);

export const PERMISSION_FLAG_NAMES = FLAG_NAMES;

const FLAG_SET = new Set(FLAG_NAMES);

const JDA_ALIASES: Record<string, string> = {
  VIEW_CHANNEL: 'ViewChannel',
  MESSAGE_SEND: 'SendMessages',
  MESSAGE_HISTORY: 'ReadMessageHistory',
  MESSAGE_MANAGE: 'ManageMessages',
  MESSAGE_EMBED_LINKS: 'EmbedLinks',
  MESSAGE_ATTACH_FILES: 'AttachFiles',
  MESSAGE_ADD_REACTION: 'AddReactions',
  MESSAGE_MENTION_EVERYONE: 'MentionEveryone',
  MESSAGE_EXT_EMOJI: 'UseExternalEmojis',
  MESSAGE_EXT_STICKER: 'UseExternalStickers',
  MESSAGE_TTS: 'SendTTSMessages',
  CREATE_PUBLIC_THREADS: 'CreatePublicThreads',
  CREATE_PRIVATE_THREADS: 'CreatePrivateThreads',
  SEND_MESSAGES_IN_THREADS: 'SendMessagesInThreads',
  MANAGE_THREADS: 'ManageThreads',
  VOICE_CONNECT: 'Connect',
  VOICE_SPEAK: 'Speak',
  VOICE_MUTE_OTHERS: 'MuteMembers',
  VOICE_DEAF_OTHERS: 'DeafenMembers',
  VOICE_MOVE_OTHERS: 'MoveMembers',
  MANAGE_CHANNEL: 'ManageChannels',
  MANAGE_PERMISSIONS: 'ManageRoles',
  MANAGE_WEBHOOKS: 'ManageWebhooks',
  MANAGE_ROLES: 'ManageRoles',
  MANAGE_NICKNAMES: 'ManageNicknames',
  MANAGE_GUILD: 'ManageGuild',
  MANAGE_EVENTS: 'ManageEvents',
  MANAGE_EXPRESSIONS: 'ManageGuildExpressions',
  CREATE_INSTANT_INVITE: 'CreateInstantInvite',
  ADMINISTRATOR: 'Administrator',
  BAN_MEMBERS: 'BanMembers',
  KICK_MEMBERS: 'KickMembers',
  MODERATE_MEMBERS: 'ModerateMembers'
};

export function normalizePermissionName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (FLAG_SET.has(trimmed)) return trimmed;

  const screaming = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
  const aliased = JDA_ALIASES[screaming];
  if (aliased && FLAG_SET.has(aliased)) return aliased;

  const pascal = screaming
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join('');
  if (FLAG_SET.has(pascal)) return pascal;
  return null;
}

export function parsePermissionNames(raw: string[] | undefined): {
  names: string[];
  unknown: string[];
} {
  const names: string[] = [];
  const unknown: string[] = [];
  if (!raw) return { names, unknown };
  for (const item of raw) {
    const normalized = normalizePermissionName(item);
    if (!normalized) {
      unknown.push(item);
      continue;
    }
    names.push(normalized);
  }
  return { names, unknown };
}

export function parsePermissionCsv(value: string | undefined): {
  names: string[];
  unknown: string[];
} {
  if (value === undefined) return { names: [], unknown: [] };
  const parts = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parsePermissionNames(parts);
}

export function permissionPatchFromBitfield(
  allowRaw?: string,
  denyRaw?: string
): Record<string, boolean | null> | { error: string } {
  const patch: Record<string, boolean | null> = {};
  try {
    if (allowRaw !== undefined && allowRaw !== '') {
      const allow = new PermissionsBitField(BigInt(allowRaw));
      for (const name of allow.toArray()) patch[name] = true;
    }
    if (denyRaw !== undefined && denyRaw !== '') {
      const deny = new PermissionsBitField(BigInt(denyRaw));
      for (const name of deny.toArray()) patch[name] = false;
    }
  } catch {
    return { error: 'Invalid permission bitfield' };
  }
  return patch;
}

export function parseOverwriteUpdate(input: {
  allow?: string[];
  deny?: string[];
  unset?: string[];
}): { patch: Record<string, boolean | null>; unknown: string[] } {
  const patch: Record<string, boolean | null> = {};
  const unknown: string[] = [];

  const apply = (names: string[] | undefined, value: boolean | null) => {
    if (!names) return;
    const parsed = parsePermissionNames(names);
    unknown.push(...parsed.unknown);
    for (const name of parsed.names) patch[name] = value;
  };

  apply(input.allow, true);
  apply(input.deny, false);
  apply(input.unset, null);
  return { patch, unknown };
}
