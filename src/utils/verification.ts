import {
  type Client,
  EmbedBuilder,
  type GuildMember,
  TextChannel,
  type User
} from 'discord.js';
import { env } from '@/env';
import { mgeApi } from '@/utils/api';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'utils/verification' });

const Colors = {
  Success: 0x57f287,
  Failure: 0xed4245
} as const;

export function verificationRoleDiff(
  currentRoleIds: readonly string[],
  verified: boolean,
  addIds: readonly string[],
  removeIds: readonly string[]
): { toAdd: string[]; toRemove: string[] } {
  const current = new Set(currentRoleIds);
  const add = verified ? addIds : removeIds;
  const remove = verified ? removeIds : addIds;
  return {
    toAdd: add.filter((id) => id.length > 0 && !current.has(id)),
    toRemove: remove.filter((id) => id.length > 0 && current.has(id))
  };
}

export async function applyVerificationRoles(
  member: GuildMember,
  verified: boolean,
  reason: string
): Promise<boolean> {
  const { toAdd, toRemove } = verificationRoleDiff(
    [...member.roles.cache.keys()],
    verified,
    env.VERIFY_ADD_ROLE_IDS,
    env.VERIFY_REMOVE_ROLE_IDS
  );
  if (toAdd.length === 0 && toRemove.length === 0) return false;

  if (toRemove.length > 0) {
    await member.roles.remove(toRemove, reason);
  }
  if (toAdd.length > 0) {
    await member.roles.add(toAdd, reason);
  }
  return true;
}

export async function sendVerificationLog(
  client: Client,
  params: {
    success: boolean;
    user: User;
    description: string;
  }
): Promise<void> {
  if (!env.VERIFICATION_LOG_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(
      env.VERIFICATION_LOG_CHANNEL_ID
    );
    if (!(channel instanceof TextChannel)) return;

    const embed = new EmbedBuilder()
      .setColor(params.success ? Colors.Success : Colors.Failure)
      .setAuthor({
        name: params.user.tag,
        iconURL: params.user.displayAvatarURL()
      })
      .setDescription(params.description)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    log.error({ err }, 'Failed to send verification log');
  }
}

export async function sendVerificationDm(
  user: User,
  content: string
): Promise<void> {
  try {
    await user.send(content);
  } catch (err) {
    log.info({ err, userId: user.id }, 'Could not DM verification update');
  }
}

export async function verifyLinkedMember(
  member: GuildMember,
  reason: string
): Promise<void> {
  if (member.user.bot || member.pending) return;
  if (env.DISCORD_GUILD_ID && member.guild.id !== env.DISCORD_GUILD_ID) {
    return;
  }

  let linked: Awaited<ReturnType<typeof mgeApi.getDiscordLink>>;
  try {
    linked = await mgeApi.getDiscordLink(member.id);
  } catch (err) {
    log.error(
      { err, memberId: member.id },
      'Failed to look up mge.tf Discord link'
    );
    return;
  }

  if (!linked) return;

  try {
    const changed = await applyVerificationRoles(member, true, reason);
    if (!changed) return;

    log.info(
      { discordId: member.id, steamId: linked.steamId },
      'Verified linked Discord member'
    );

    const origin = env.MGE_API_URL.replace(/\/+$/, '');
    await Promise.all([
      sendVerificationLog(member.client, {
        success: true,
        user: member.user,
        description: `Verified as **${linked.steamUsername}** (\`${linked.steamId}\`). [Profile](${origin}/users/${linked.steamId})`
      }),
      sendVerificationDm(
        member.user,
        'Hey, we noticed your Discord is linked on mge.tf, so we gave you the **MGER** role. You are all set.'
      )
    ]);
  } catch (err) {
    log.error(
      { err, memberId: member.id },
      'Failed to apply verification roles'
    );
    await sendVerificationLog(member.client, {
      success: false,
      user: member.user,
      description: `Linked to **${linked.steamUsername}** (\`${linked.steamId}\`) but failed to update roles.`
    });
  }
}
