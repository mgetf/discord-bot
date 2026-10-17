import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/env';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'agent/models' });

export type AgentModel = {
  id: string;
  name: string;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const AUTOCOMPLETE_LIMIT = 25;
const CHOICE_NAME_MAX = 100;
const MODEL_ID_MAX = 100;

let cache: { models: AgentModel[]; fetchedAt: number } | null = null;
let inflight: Promise<AgentModel[]> | null = null;

export function isAnthropicModelId(value: string): boolean {
  return (
    value.length >= 7 &&
    value.length <= MODEL_ID_MAX &&
    /^claude[a-z0-9._:@-]{1,93}$/i.test(value)
  );
}

export function filterAgentModels(
  models: AgentModel[],
  query: string
): AgentModel[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? models.filter(
        (model) =>
          model.id.toLowerCase().includes(q) ||
          model.name.toLowerCase().includes(q)
      )
    : models;
  if (!q) return matched.slice(0, AUTOCOMPLETE_LIMIT);

  return [...matched]
    .sort((a, b) => prefixScore(a, q) - prefixScore(b, q))
    .slice(0, AUTOCOMPLETE_LIMIT);
}

export function toAutocompleteChoice(model: AgentModel): {
  name: string;
  value: string;
} {
  const value = model.id.slice(0, MODEL_ID_MAX);
  const label =
    model.name && model.name !== model.id
      ? `${model.name} (${model.id})`
      : model.id;
  return { name: label.slice(0, CHOICE_NAME_MAX), value };
}

export function labelForAgentModel(id: string): string {
  return cache?.models.find((model) => model.id === id)?.name ?? id;
}

export async function listAgentModels(force = false): Promise<AgentModel[]> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }
  if (inflight) return inflight;
  inflight = fetchModels().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function resolveAgentModel(
  id: string
): Promise<AgentModel | null> {
  const trimmed = id.trim();
  if (!isAnthropicModelId(trimmed)) return null;

  const listed = (await listAgentModels()).find(
    (model) => model.id === trimmed
  );
  if (listed) return listed;

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const info = await client.models.retrieve(trimmed);
    const model: AgentModel = {
      id: trimmed,
      name: info.display_name?.trim() || info.id
    };
    remember(model);
    return model;
  } catch (err) {
    log.warn({ err, id: trimmed }, 'Unknown Anthropic model');
    return null;
  }
}

async function fetchModels(): Promise<AgentModel[]> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return cache?.models ?? [];

  try {
    const client = new Anthropic({ apiKey });
    const models: AgentModel[] = [];
    const seen = new Set<string>();
    for await (const info of client.models.list({ limit: 1000 })) {
      if (!info.id || seen.has(info.id)) continue;
      seen.add(info.id);
      models.push({
        id: info.id,
        name: info.display_name?.trim() || info.id
      });
    }
    cache = { models, fetchedAt: Date.now() };
    return models;
  } catch (err) {
    log.warn({ err }, 'Failed to list Anthropic models');
    return cache?.models ?? [];
  }
}

function remember(model: AgentModel): void {
  if (!cache) {
    cache = { models: [model], fetchedAt: Date.now() };
    return;
  }
  if (cache.models.some((entry) => entry.id === model.id)) return;
  cache.models = [model, ...cache.models];
}

function prefixScore(model: AgentModel, query: string): number {
  const id = model.id.toLowerCase();
  const name = model.name.toLowerCase();
  if (id.startsWith(query) || name.startsWith(query)) return 0;
  return 1;
}
