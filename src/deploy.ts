import { REST, Routes } from 'discord.js';
import { env } from '@/env';
import { getCommands } from '@/utils/core';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'deploy' });

const main = async () => {
  const isGlobal = process.argv.includes('--global');
  const commands = await getCommands();
  const data = commands.map((command) => command.data.toJSON());

  log.info({ count: data.length }, 'Loaded commands');
  for (const cmd of data) {
    log.info({ displayName: cmd.name, description: cmd.description }, cmd.name);
  }

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN);

  if (isGlobal) {
    await rest.put(Routes.applicationCommands(env.DISCORD_APPLICATION_ID), {
      body: data
    });
    log.info({ count: commands.length }, 'Deployed commands globally');
  } else {
    if (!env.DISCORD_GUILD_ID) {
      throw new Error(
        'DISCORD_GUILD_ID is required for guild deployment. Use --global for global deployment.'
      );
    }
    await rest.put(
      Routes.applicationGuildCommands(
        env.DISCORD_APPLICATION_ID,
        env.DISCORD_GUILD_ID
      ),
      { body: data }
    );
    log.info(
      { count: commands.length, guildId: env.DISCORD_GUILD_ID },
      'Deployed commands to guild'
    );
  }
};

main().catch((error) => {
  log.error({ err: error }, 'Failed to deploy commands');
  process.exitCode = 1;
});
