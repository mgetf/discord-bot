import { Client, GatewayIntentBits, Partials } from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // Privileged. Required for GuildMemberUpdate (role changes) per Discord gateway docs.
    GatewayIntentBits.GuildMembers
  ],
  // Without GuildMember, discord.js does not emit GuildMemberUpdate for uncached members.
  partials: [Partials.GuildMember, Partials.User]
});
