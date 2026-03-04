import fs from 'node:fs';
import path from 'node:path';
import type { ClientEvents, Interaction } from 'discord.js';
import type { Command, Event } from '@/types';

/**
 * Collects .ts files and index.ts in subdirectories
 */
const collectModuleFiles = (baseDir: string): string[] => {
  const files: string[] = [];

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path.join(baseDir, entry.name));
    } else if (entry.isDirectory()) {
      const indexFile = path.join(baseDir, entry.name, 'index.ts');
      if (fs.existsSync(indexFile)) {
        files.push(indexFile);
      }
    }
  }

  return files;
};

/**
 * Dynamically loads all commands from the commands directory
 */
export const getCommands = async (): Promise<Command<Interaction>[]> => {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const files = collectModuleFiles(commandsPath);

  return Promise.all(
    files.map(async (file) => {
      const mod = await import(file);
      return mod.command as Command<Interaction>;
    })
  );
};

/**
 * Dynamically loads all events from the events directory
 */
export const getEvents = async (): Promise<Event<keyof ClientEvents>[]> => {
  const eventsPath = path.join(__dirname, '..', 'events');
  const files = collectModuleFiles(eventsPath);

  return Promise.all(
    files.map(async (file) => {
      const mod = await import(file);
      return mod.event as Event<keyof ClientEvents>;
    })
  );
};
