import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';
import type { Command } from '@/types';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Responds with the bot's latency."),
  execute: async (interaction) => {
    const latency = interaction.client.ws.ping;
    await interaction.reply({
      content: `🏓 Pong! Latency: **${latency}ms**`,
      flags: MessageFlags.Ephemeral
    });
  }
};
