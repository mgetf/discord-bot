import { Client, GatewayIntentBits, Partials } from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // Privileged. Required for GuildMemberUpdate (role changes) per Discord gateway docs.
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    // Privileged. Required to read message text for the AI agent.
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages
  ],
  // Without GuildMember, discord.js does not emit GuildMemberUpdate for uncached members.
  // Channel is required to receive DMs (uncached DM channels).
  partials: [
    Partials.GuildMember,
    Partials.User,
    Partials.Message,
    Partials.Channel
  ]
});
