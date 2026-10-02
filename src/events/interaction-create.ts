import { Events, MessageFlags } from 'discord.js';
import {
  AGENT_PROMPT_MODAL_ID,
  handleAgentPromptModal
} from '@/commands/agent';
import type { Event } from '@/types';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'events/interaction-create' });

export const event: Event<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (interaction.isModalSubmit()) {
      if (interaction.customId !== AGENT_PROMPT_MODAL_ID) return;
      try {
        await handleAgentPromptModal(interaction);
      } catch (error) {
        log.error({ err: error }, 'Error handling agent prompt modal');
        await replyError(
          interaction,
          'An error occurred while saving the prompt.'
        );
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      log.warn(`Command not found: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      log.error(
        { err: error },
        `Error executing command: ${interaction.commandName}`
      );
      await replyError(
        interaction,
        'An error occurred while executing this command.'
      );
    }
  }
};

async function replyError(
  interaction: {
    replied: boolean;
    deferred: boolean;
    followUp: (options: {
      content: string;
      flags: typeof MessageFlags.Ephemeral;
    }) => Promise<unknown>;
    reply: (options: {
      content: string;
      flags: typeof MessageFlags.Ephemeral;
    }) => Promise<unknown>;
  },
  errorMessage: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({
      content: errorMessage,
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  await interaction.reply({
    content: errorMessage,
    flags: MessageFlags.Ephemeral
  });
}
