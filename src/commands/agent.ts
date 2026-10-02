import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { isAllowedAgentUser } from '@/agent/allowlist';
import { AGENT_ALLOWED_MENTIONS } from '@/agent/mentions';
import {
  AGENT_MODELS,
  getAgentModel,
  getSystemPrompt,
  isAgentModelId,
  resetAgentSettings,
  setAgentModel,
  setSystemPrompt
} from '@/agent/settings';
import type { Command } from '@/types';

export const AGENT_PROMPT_MODAL_ID = 'agent-system-prompt';
const PROMPT_INPUT_ID = 'prompt';
const PROMPT_MAX_LENGTH = 4000;

const ephemeral = {
  flags: MessageFlags.Ephemeral,
  allowedMentions: AGENT_ALLOWED_MENTIONS
} as const;

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('agent')
    .setDescription('Configure the AI ops assistant')
    .addSubcommand((sub) =>
      sub
        .setName('model')
        .setDescription('Choose the Anthropic model')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Model to use for the next turns')
            .setRequired(true)
            .addChoices(
              ...AGENT_MODELS.map((model) => ({
                name: model.name,
                value: model.value
              }))
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('prompt').setDescription('Edit the system prompt')
    )
    .addSubcommand((sub) =>
      sub.setName('show').setDescription('Show the current model and prompt')
    )
    .addSubcommand((sub) =>
      sub.setName('reset').setDescription('Reset model and prompt to defaults')
    ),

  execute: async (interaction) => {
    if (!isAllowedAgentUser(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not allowed to configure the AI agent.',
        ...ephemeral
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'prompt') {
      await interaction.showModal(promptModal());
      return;
    }

    if (sub === 'model') {
      const name = interaction.options.getString('name', true);
      if (!isAgentModelId(name)) {
        await interaction.reply({
          content: 'Unknown model.',
          ...ephemeral
        });
        return;
      }
      setAgentModel(name);
      await interaction.reply({
        content: `Model set to **${labelFor(name)}** (\`${name}\`).`,
        ...ephemeral
      });
      return;
    }

    if (sub === 'reset') {
      resetAgentSettings();
      await interaction.reply({
        content: `Reset to defaults.\nModel: **${labelFor(getAgentModel())}** (\`${getAgentModel()}\`)`,
        ...ephemeral
      });
      return;
    }

    await interaction.reply({
      content: formatShow(),
      ...ephemeral
    });
  }
};

export async function handleAgentPromptModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!isAllowedAgentUser(interaction.user.id)) {
    await interaction.reply({
      content: 'You are not allowed to configure the AI agent.',
      ...ephemeral
    });
    return;
  }

  const prompt = interaction.fields.getTextInputValue(PROMPT_INPUT_ID);
  setSystemPrompt(prompt);
  await interaction.reply({
    content: `System prompt updated (${getSystemPrompt().length} characters).`,
    ...ephemeral
  });
}

function promptModal(): ModalBuilder {
  const current = getSystemPrompt().slice(0, PROMPT_MAX_LENGTH);
  const input = new TextInputBuilder()
    .setCustomId(PROMPT_INPUT_ID)
    .setLabel('System prompt')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(PROMPT_MAX_LENGTH)
    .setValue(current);

  return new ModalBuilder()
    .setCustomId(AGENT_PROMPT_MODAL_ID)
    .setTitle('Agent system prompt')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input)
    );
}

function formatShow(): string {
  const model = getAgentModel();
  const prompt = getSystemPrompt();
  const header = `Model: **${labelFor(model)}** (\`${model}\`)\nPrompt (${prompt.length} chars):`;
  const budget = 1900 - header.length;
  const body =
    prompt.length > budget ? `${prompt.slice(0, budget - 1)}…` : prompt;
  return `${header}\n\`\`\`\n${body}\n\`\`\``;
}

function labelFor(model: string): string {
  return AGENT_MODELS.find((entry) => entry.value === model)?.name ?? model;
}
