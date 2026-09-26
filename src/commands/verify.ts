import {
  type ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';
import { env } from '@/env';
import type { Command } from '@/types';
import { mgeApi } from '@/utils/api';
import { logger } from '@/utils/logger';
import {
  applyVerificationRoles,
  sendVerificationLog
} from '@/utils/verification';

const log = logger.child({ name: 'commands/verify' });

const STEAM_ID_REGEX = /\/users\/(\d{17})/;
const VERIFY_REASON = 'mge.tf /verify';
const LINK_INSTRUCTIONS =
  'To link your account:\n' +
  '1. Log in at <https://mge.tf>\n' +
  '2. Open your profile and click **Link Discord**\n' +
  '3. Roles are applied automatically. You can run `/verify` if they are missing.';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription(
      'Confirm your mge.tf Discord link and receive the MGER role.'
    )
    .addStringOption((option) =>
      option
        .setName('profile')
        .setDescription(
          'Your mge.tf profile URL (optional — used to confirm the correct account)'
        )
        .setRequired(false)
    ),

  execute: async (interaction) => {
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

    if (!linkedAccount) {
      if (providedSteamId) {
        try {
          const profileUser = await mgeApi.getUserBySteamId(providedSteamId);

          if (!profileUser) {
            await sendVerificationLog(interaction.client, {
              success: false,
              user: interaction.user,
              description: `Provided profile \`${providedSteamId}\` — no mge.tf account found.`
            });
            await interaction.editReply(
              `No mge.tf account found for Steam ID \`${providedSteamId}\`. Make sure the profile URL is correct.`
            );
            return;
          }

          if (
            profileUser.discordId &&
            profileUser.discordId !== interaction.user.id
          ) {
            await sendVerificationLog(interaction.client, {
              success: false,
              user: interaction.user,
              description: `Provided profile **${profileUser.steamUsername}** (\`${providedSteamId}\`) — linked to a different Discord account (**${profileUser.discordUsername ?? 'unknown'}**).`
            });
            await interaction.editReply(
              `The mge.tf account **${profileUser.steamUsername}** (\`${providedSteamId}\`) is linked to a different Discord account (**${profileUser.discordUsername ?? 'unknown'}**).\n\n` +
                'If this is your mge.tf account, unlink Discord from your profile at <https://mge.tf> or contact an admin.'
            );
            return;
          }

          if (!profileUser.discordId) {
            await sendVerificationLog(interaction.client, {
              success: false,
              user: interaction.user,
              description: `Provided profile **${profileUser.steamUsername}** (\`${providedSteamId}\`) — no Discord account linked on mge.tf.`
            });
            await interaction.editReply(
              `The mge.tf account **${profileUser.steamUsername}** (\`${providedSteamId}\`) exists but has no Discord account linked.\n\n` +
                LINK_INSTRUCTIONS
            );
            return;
          }
        } catch (err) {
          log.error({ err }, 'Failed to look up mge.tf user by Steam ID');
        }
      }

      await sendVerificationLog(interaction.client, {
        success: false,
        user: interaction.user,
        description: 'Discord account is not linked to any mge.tf account.'
      });
      await interaction.editReply(
        'Your Discord account is not linked to any mge.tf account.\n\n' +
          LINK_INSTRUCTIONS
      );
      return;
    }

    if (providedSteamId && providedSteamId !== linkedAccount.steamId) {
      await sendVerificationLog(interaction.client, {
        success: false,
        user: interaction.user,
        description: `Provided profile \`${providedSteamId}\` does not match linked account **${linkedAccount.steamUsername}** (\`${linkedAccount.steamId}\`).`
      });
      await interaction.editReply(
        `The profile you provided (**${providedSteamId}**) does not match the mge.tf account linked to your Discord (**${linkedAccount.steamUsername}** — \`${linkedAccount.steamId}\`).\n\n` +
          'Make sure you linked the correct mge.tf account at <https://mge.tf>.'
      );
      return;
    }

    try {
      await applyVerificationRoles(interaction.member, true, VERIFY_REASON);
    } catch (err) {
      log.error(
        { err, userId: interaction.user.id },
        'Failed to update roles during verification'
      );
      await sendVerificationLog(interaction.client, {
        success: false,
        user: interaction.user,
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

    await sendVerificationLog(interaction.client, {
      success: true,
      user: interaction.user,
      description: `Verified as **${linkedAccount.steamUsername}** (\`${linkedAccount.steamId}\`). [Profile](https://mge.tf/users/${linkedAccount.steamId})`
    });

    await interaction.editReply(
      `You have been verified as **${linkedAccount.steamUsername}** on mge.tf. Welcome, ${displayName}!`
    );
  }
};
