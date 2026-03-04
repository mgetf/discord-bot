import {
  type ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js'
import type { Command } from '@/types'
import { env } from '@/env'
import { mgeApi } from '@/utils/api'
import { logger } from '@/utils/logger'

const log = logger.child({ name: 'commands/verify' })

const STEAM_ID_REGEX = /\/users\/(\d{17})/

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Link your mge.tf account and receive the Verified role.')
    .addStringOption((option) =>
      option
        .setName('profile')
        .setDescription('Your mge.tf profile URL (optional — used to confirm the correct account)')
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
      })
      return
    }

    if (!(interaction.member instanceof GuildMember)) {
      await interaction.reply({
        content: 'This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral
      })
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const profileArg = interaction.options.getString('profile')

    // Parse Steam ID from the profile URL when one was provided
    let providedSteamId: string | null = null
    if (profileArg) {
      const match = STEAM_ID_REGEX.exec(profileArg)
      if (!match || !match[1]) {
        await interaction.editReply(
          'The profile URL you provided looks invalid. Expected format: `https://mge.tf/users/76561198XXXXXXXXX`'
        )
        return
      }
      providedSteamId = match[1]
    }

    let linkedAccount: Awaited<ReturnType<typeof mgeApi.getDiscordLink>>

    try {
      linkedAccount = await mgeApi.getDiscordLink(interaction.user.id)
    } catch (err) {
      log.error({ err }, 'Failed to call mge.tf API during /verify')
      await interaction.editReply(
        'Could not reach the mge.tf API right now. Please try again later.'
      )
      return
    }

    // No linked account found
    if (!linkedAccount) {
      await interaction.editReply(
        'Your Discord account is not linked to any mge.tf account.\n\n' +
          'To link your account:\n' +
          '1. Log in at <https://mge.tf>\n' +
          '2. Go to your profile and click **Link Discord Account**\n' +
          '3. Run `/verify` again once linked'
      )
      return
    }

    // If a profile URL was provided, confirm it matches the linked account
    if (providedSteamId && providedSteamId !== linkedAccount.steamId) {
      await interaction.editReply(
        `The profile you provided (**${providedSteamId}**) does not match the mge.tf account linked to your Discord (**${linkedAccount.steamUsername}** — \`${linkedAccount.steamId}\`).\n\n` +
          'Make sure you linked the correct mge.tf account at <https://mge.tf>.'
      )
      return
    }

    // Assign the verified role
    try {
      await interaction.member.roles.add(env.VERIFIED_ROLE_ID)
    } catch (err) {
      log.error({ err, userId: interaction.user.id }, 'Failed to assign verified role')
      await interaction.editReply(
        'Your account is linked, but I could not assign the Verified role. Please contact an admin.'
      )
      return
    }

    const displayName = linkedAccount.discordUsername
      ? `${linkedAccount.discordUsername}`
      : interaction.user.username

    log.info(
      { discordId: interaction.user.id, steamId: linkedAccount.steamId },
      'User verified successfully'
    )

    await interaction.editReply(
      `You have been verified as **${linkedAccount.steamUsername}** on mge.tf. Welcome, ${displayName}!`
    )
  }
}
