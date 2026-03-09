import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
  TextChannel
} from 'discord.js';
import type { Command } from '@/types';
import { env } from '@/env';
import { mgeApi } from '@/utils/api';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'commands/verify' });

const STEAM_ID_REGEX = /\/users\/(\d{17})/;

const Colors = {
  Success: 0x57f287,
  Failure: 0xed4245,
  Warning: 0xfee75c
} as const;

async function sendVerificationLog(
  interaction: ChatInputCommandInteraction,
  { success, description }: { success: boolean; description: string }
) {
  if (!env.VERIFICATION_LOG_CHANNEL_ID) return;

  try {
    const channel = await interaction.client.channels.fetch(
      env.VERIFICATION_LOG_CHANNEL_ID
    );

    if (!(channel instanceof TextChannel)) return;

    const embed = new EmbedBuilder()
      .setColor(success ? Colors.Success : Colors.Failure)
      .setAuthor({
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setDescription(description)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    log.error({ err }, 'Failed to send verification log');
  }
}

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Link your mge.tf account and receive the Verified role.')
    .addStringOption((option) =>
      option
        .setName('profile')
        .setDescription(
          'Your mge.tf profile URL (optional — used to confirm the correct account)'
        )
        .setRequired(false)
    ),

  execute: async (interaction) => {
    // Restrict to the configured verification channel if set
    if (
      env.VERIFICATION_CHANNEL_ID &&
      interaction.channelId !== env.VERIFICATION_CHANNEL_ID
    ) {
      await interaction.reply({
        content: `Please use <#${env.VERIFICATION_CHANNEL_ID}> to verify.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!(interaction.member instanceof GuildMember)) {
      await interaction.reply({
        content: 'This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const profileArg = interaction.options.getString('profile');

    // Parse Steam ID from the profile URL when one was provided
    let providedSteamId: string | null = null;
    if (profileArg) {
      const match = STEAM_ID_REGEX.exec(profileArg);
      if (!match || !match[1]) {
        await interaction.editReply(
          'The profile URL you provided looks invalid. Expected format: `https://mge.tf/users/76561198XXXXXXXXX`'
        );
        return;
      }
      providedSteamId = match[1];
    }

    let linkedAccount: Awaited<ReturnType<typeof mgeApi.getDiscordLink>>;

    try {
      linkedAccount = await mgeApi.getDiscordLink(interaction.user.id);
    } catch (err) {
      log.error({ err }, 'Failed to call mge.tf API during /verify');
      await interaction.editReply(
        'Could not reach the mge.tf API right now. Please try again later.'
      );
      return;
    }

    // No linked account found
    if (!linkedAccount) {
      // If a profile URL was provided, look up that account to give a better message
      if (providedSteamId) {
        try {
          const profileUser =
            await mgeApi.getUserBySteamId(providedSteamId);

          if (!profileUser) {
            await sendVerificationLog(interaction, {
              success: false,
              description: `Provided profile \`${providedSteamId}\` — no mge.tf account found.`
            });
            await interaction.editReply(
              `No mge.tf account found for Steam ID \`${providedSteamId}\`. Make sure the profile URL is correct.`
            );
            return;
          }

          if (profileUser.discordId && profileUser.discordId !== interaction.user.id) {
            await sendVerificationLog(interaction, {
              success: false,
              description: `Provided profile **${profileUser.steamUsername}** (\`${providedSteamId}\`) — linked to a different Discord account (**${profileUser.discordUsername ?? 'unknown'}**).`
            });
            await interaction.editReply(
              `The mge.tf account **${profileUser.steamUsername}** (\`${providedSteamId}\`) is linked to a different Discord account (**${profileUser.discordUsername ?? 'unknown'}**).\n\n` +
                'If this is your mge.tf account, please contact an admin to have the old Discord account unlinked.'
            );
            return;
          }

          if (!profileUser.discordId) {
            await sendVerificationLog(interaction, {
              success: false,
              description: `Provided profile **${profileUser.steamUsername}** (\`${providedSteamId}\`) — no Discord account linked on mge.tf.`
            });
            await interaction.editReply(
              `The mge.tf account **${profileUser.steamUsername}** (\`${providedSteamId}\`) exists but has no Discord account linked.\n\n` +
                'To link your account:\n' +
                '1. Log in at <https://mge.tf>\n' +
                '2. Go to your profile and click **Link Discord Account**\n' +
                '3. Run `/verify` again once linked'
            );
            return;
          }
        } catch (err) {
          log.error({ err }, 'Failed to look up mge.tf user by Steam ID');
        }
      }

      await sendVerificationLog(interaction, {
        success: false,
        description: 'Discord account is not linked to any mge.tf account.'
      });
      await interaction.editReply(
        'Your Discord account is not linked to any mge.tf account.\n\n' +
          'To link your account:\n' +
          '1. Log in at <https://mge.tf>\n' +
          '2. Go to your profile and click **Link Discord Account**\n' +
          '3. Run `/verify` again once linked'
      );
      return;
    }

    // If a profile URL was provided, confirm it matches the linked account
    if (providedSteamId && providedSteamId !== linkedAccount.steamId) {
      await sendVerificationLog(interaction, {
        success: false,
        description: `Provided profile \`${providedSteamId}\` does not match linked account **${linkedAccount.steamUsername}** (\`${linkedAccount.steamId}\`).`
      });
      await interaction.editReply(
        `The profile you provided (**${providedSteamId}**) does not match the mge.tf account linked to your Discord (**${linkedAccount.steamUsername}** — \`${linkedAccount.steamId}\`).\n\n` +
          'Make sure you linked the correct mge.tf account at <https://mge.tf>.'
      );
      return;
    }

    // Update roles on verification
    try {
      const { roles } = interaction.member;
      await Promise.all([
        ...env.VERIFY_ADD_ROLE_IDS.map((id) => roles.add(id)),
        ...env.VERIFY_REMOVE_ROLE_IDS.map((id) => roles.remove(id))
      ]);
    } catch (err) {
      log.error(
        { err, userId: interaction.user.id },
        'Failed to update roles during verification'
      );
      await sendVerificationLog(interaction, {
        success: false,
        description: `Linked to **${linkedAccount.steamUsername}** (\`${linkedAccount.steamId}\`) but failed to update roles.`
      });
      await interaction.editReply(
        'Your account is linked, but I could not update your roles. Please contact an admin.'
      );
      return;
    }

    const displayName = linkedAccount.discordUsername
      ? `${linkedAccount.discordUsername}`
      : interaction.user.username;

    log.info(
      { discordId: interaction.user.id, steamId: linkedAccount.steamId },
      'User verified successfully'
    );

    await sendVerificationLog(interaction, {
      success: true,
      description: `Verified as **${linkedAccount.steamUsername}** (\`${linkedAccount.steamId}\`). [Profile](https://mge.tf/users/${linkedAccount.steamId})`
    });

    await interaction.editReply(
      `You have been verified as **${linkedAccount.steamUsername}** on mge.tf. Welcome, ${displayName}!`
    );
  }
};
