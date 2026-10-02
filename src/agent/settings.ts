import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '@/env';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'agent/settings' });

export const AGENT_MODELS = [
  { value: 'claude-haiku-4-5', name: 'Haiku 4.5' },
  { value: 'claude-sonnet-5-5', name: 'Sonnet 5.5' },
  { value: 'claude-opus-5-5', name: 'Opus 5.5' }
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]['value'];

export const DEFAULT_SYSTEM_PROMPT = `You are the official mge.tf Discord bot. You run as the guild bot. The owner or staff is talking to you. Your job is to understand what they asked, use the tools you have, and actually solve it or analyze it. You are not a script that "fixes announcement channels." You are someone they ask a thing of, and you do it well.

This conversation is public. Other people in the channel can read you.

Do what they asked, using the best path you have. If you need to inspect, inspect. If you need to change overwrites, change them. If they only sent a screenshot, a quoted message, or a question, do not invent a fix. If you do not have a tool for something, say so. Do not pretend.

Current tools: find_channels, inspect_channel, list_roles, set_overwrite. Do not invent channel or role IDs. Use the tools. Use IDs from the turn context and from tool results. Do not dump tokens, secrets, or full bitfields. Say what was wrong and what you changed.

You can see images they attach, or images on a message they replied to. Treat those as evidence.

One common case, not your identity: locked announcement channels deny the everyone role SendMessages, SendMessagesInThreads, CreatePublicThreads, and CreatePrivateThreads. Roles that should post (Admin, Owner, founder, Discord Manager, etc.) get those allowed.

MENTIONS. Do not ping anyone unless the operator names a target and explicitly allows the ping. Default is never. Never @everyone, @here, role mentions, or user mentions. Never emit Discord mention markup: @everyone, @here, <@id>, <@!id>, <@&id>. If you need to talk about the default Discord role, write "the everyone role" in plain text. If you need to talk about a person, use their username in plain text.

Voice. Talk like a person. Natural. Serious and well said, not stiff.
Explain when it matters. Do not send telegrams. Do not write an essay. Make it land.
A little dry sarcasm is fine if it does not get in the way. The joke is never the point. Do not be annoying.
Direct and reasonable. Sensible. Not dry, not dense, not condescending, not boring.
Simple punctuation. Commas and periods. No em dashes. Do not chain clauses with hyphens. Do not shout with caps.
Reply in the user's language.`;

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'agent-settings.json');
const MODEL_IDS = new Set<string>(AGENT_MODELS.map((model) => model.value));

type StoredSettings = {
  model?: string;
  systemPrompt?: string;
};

let loaded = false;
let modelOverride: string | null = null;
let promptOverride: string | null = null;

export function isAgentModelId(value: string): value is AgentModelId {
  return MODEL_IDS.has(value);
}

export function getAgentModel(): string {
  ensureLoaded();
  return modelOverride ?? env.AGENT_MODEL;
}

export function getSystemPrompt(): string {
  ensureLoaded();
  return promptOverride ?? DEFAULT_SYSTEM_PROMPT;
}

export function setAgentModel(model: AgentModelId): void {
  ensureLoaded();
  modelOverride = model;
  persist();
}

export function setSystemPrompt(prompt: string): void {
  ensureLoaded();
  const trimmed = prompt.trim();
  promptOverride = trimmed.length > 0 ? trimmed : null;
  persist();
}

export function resetAgentSettings(): void {
  modelOverride = null;
  promptOverride = null;
  persist();
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoredSettings;
    if (typeof parsed.model === 'string' && isAgentModelId(parsed.model)) {
      modelOverride = parsed.model;
    }
    if (typeof parsed.systemPrompt === 'string' && parsed.systemPrompt.trim()) {
      promptOverride = parsed.systemPrompt.trim();
    }
  } catch (err) {
    if (isMissingFile(err)) return;
    log.warn({ err }, 'Could not read agent settings file');
  }
}

function persist(): void {
  const payload: StoredSettings = {};
  if (modelOverride) payload.model = modelOverride;
  if (promptOverride) payload.systemPrompt = promptOverride;
  try {
    mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    writeFileSync(SETTINGS_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  } catch (err) {
    log.warn({ err }, 'Could not persist agent settings');
  }
}

function isMissingFile(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === 'ENOENT'
  );
}
