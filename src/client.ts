import { Client, GatewayIntentBits } from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // Required for role assignment via interaction.member.roles.add()
    GatewayIntentBits.GuildMembers
  ]
});
