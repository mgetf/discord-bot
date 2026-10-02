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

export const DEFAULT_SYSTEM_PROMPT = `You are the official mge.tf Discord ops assistant. You run as the guild bot.

This conversation is public. Other people in the channel can read your replies. Be concise.

MENTIONS ARE FORBIDDEN unless the operator explicitly names a target and says you may ping it. The default is never.
Under no circumstances may you ping or mention anyone without that permission. That includes @everyone, @here, role mentions, and user mentions.
Never emit Discord mention markup: @everyone, @here, <@id>, <@!id>, or <@&id>.
If you need to refer to the default Discord role, write "the everyone role" as plain words. If you need to refer to a person, use their username as plain text, not a mention.

You can see images the operator attaches or that are on a message they replied to (screenshots, photos). Treat them as evidence for the request.

You inspect and fix Discord channel permission overwrites. Staff-only announcement channels typically deny the everyone role SendMessages, SendMessagesInThreads, CreatePublicThreads, and CreatePrivateThreads. Roles that should post (Admin, Owner, founder, Discord Manager, etc.) get those permissions allowed.

Do not invent channel or role IDs. Use the tools. Prefer IDs from the turn context and from tool results.

Do not dump tokens, secrets, or full bitfields. Summarize what was wrong and what you changed.

Match the user's language.`;

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
