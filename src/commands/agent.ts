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
  filterAgentModels,
  labelForAgentModel,
  listAgentModels,
  resolveAgentModel,
  toAutocompleteChoice
} from '@/agent/models';
import {
  getAgentModel,
  getSystemPrompt,
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
            .setDescription('Anthropic model id (type to search)')
            .setRequired(true)
            .setAutocomplete(true)
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

  autocomplete: async (interaction) => {
    if (!isAllowedAgentUser(interaction.user.id)) {
      await interaction.respond([]);
      return;
    }
    if (interaction.options.getSubcommand() !== 'model') {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'name') {
      await interaction.respond([]);
      return;
    }
    const models = await listAgentModels();
    await interaction.respond(
      filterAgentModels(models, focused.value).map(toAutocompleteChoice)
    );
  },

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
      await interaction.deferReply(ephemeral);
      const model = await resolveAgentModel(name);
      if (!model) {
        await interaction.editReply({
          content:
            'Unknown Anthropic model. Pick one from the autocomplete list or type a valid Claude model id.'
        });
        return;
      }
      setAgentModel(model.id);
      await interaction.editReply({
        content: `Model set to **${model.name}** (\`${model.id}\`).`
      });
      return;
    }

    if (sub === 'reset') {
      resetAgentSettings();
      await interaction.reply({
        content: `Reset to defaults.\nModel: **${labelForAgentModel(getAgentModel())}** (\`${getAgentModel()}\`)`,
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
  const header = `Model: **${labelForAgentModel(model)}** (\`${model}\`)\nPrompt (${prompt.length} chars):`;
  const budget = 1900 - header.length;
  const body =
    prompt.length > budget ? `${prompt.slice(0, budget - 1)}…` : prompt;
  return `${header}\n\`\`\`\n${body}\n\`\`\``;
}
