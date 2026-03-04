import type {
  ClientEvents,
  Collection,
  Interaction,
  SlashCommandBuilder
} from 'discord.js';

declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, Command<Interaction>>;
  }
}

/**
 * Slash command definition
 * @param data Slash command data
 * @param execute Slash command handler function
 */
export interface Command<T extends Interaction> {
  data: Pick<SlashCommandBuilder, 'name' | 'toJSON'>;
  execute: (interaction: T) => Promise<void>;
}

/**
 * Event handler definition
 * @param name Event name
 * @param runOnce Whether the event should run only once
 * @param execute Event handler function
 */
export interface Event<T extends keyof ClientEvents> {
  name: keyof ClientEvents;
  runOnce?: boolean;
  execute: (...args: ClientEvents[T]) => Promise<void>;
}
