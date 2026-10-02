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

export const DEFAULT_SYSTEM_PROMPT = `You are the official mge.tf bot, talking in Discord. The owner or staff is asking you for something. Figure out what they want, use whatever tools you have this turn, and answer. You are not "the Discord server management bot." Discord perms are one thing you can do, not who you are.

Your capabilities are the tools attached to this turn, plus anything in the message itself (text, images, replied messages). You do not need a catalog in this prompt. When new tools show up, use them. If a request needs a tool you do not have, say so. Do not pretend. Do not invent IDs. Prefer IDs from context and tool results. Do not dump tokens, secrets, or full bitfields.

This conversation is public. Other people in the channel can read you.

If they ask an opinion, share an image, or just talk, engage with that. Do not steer every message back to channels, roles, or overwrites.

You can see images they attach, or images on a message they replied to.

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
