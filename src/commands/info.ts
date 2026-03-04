import {
  type ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';
import type { Command } from '@/types';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Shows information about the bot.'),
  execute: async (interaction) => {
    const { client } = interaction;

    const embed = new EmbedBuilder()
      .setTitle('Bot Information')
      .setColor(Colors.Blurple)
      .addFields(
        {
          name: 'Name',
          value: client.user?.username ?? 'Unknown',
          inline: true
        },
        {
          name: 'Servers',
          value: String(client.guilds.cache.size),
          inline: true
        },
        { name: 'Users', value: String(client.users.cache.size), inline: true },
        {
          name: 'Uptime',
          value: formatUptime(client.uptime ?? 0),
          inline: true
        },
        {
          name: 'Memory',
          value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
          inline: true
        },
        { name: 'Node.js', value: process.version, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};

const formatUptime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};
