import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export const SESSION_TTL_MS = 30 * 60 * 1000;
export const MAX_SESSION_MESSAGES = 24;

export type AgentSession = {
  key: string;
  channelId: string;
  userId: string;
  messages: MessageParam[];
  updatedAt: number;
  busy: boolean;
};

const sessions = new Map<string, AgentSession>();

export function sessionKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

export function getOrCreateSession(
  channelId: string,
  userId: string
): AgentSession {
  pruneExpiredSessions();
  const key = sessionKey(channelId, userId);
  const existing = sessions.get(key);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const created: AgentSession = {
    key,
    channelId,
    userId,
    messages: [],
    updatedAt: Date.now(),
    busy: false
  };
  sessions.set(key, created);
  return created;
}

export function pruneExpiredSessions(now = Date.now()): void {
  for (const [key, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(key);
  }
}

export function pruneAgentMessages(
  messages: MessageParam[],
  maxMessages = MAX_SESSION_MESSAGES
): MessageParam[] {
  let next =
    messages.length > maxMessages ? messages.slice(-maxMessages) : messages;

  while (next.length > 0) {
    const first = next[0];
    if (!first) break;
    if (first.role === 'assistant' || isToolResultMessage(first)) {
      next = next.slice(1);
      continue;
    }
    break;
  }

  return next;
}

function isToolResultMessage(message: MessageParam): boolean {
  if (message.role !== 'user' || !Array.isArray(message.content)) return false;
  return message.content.some(
    (block) =>
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      block.type === 'tool_result'
  );
}

export function clearSessionsForTests(): void {
  sessions.clear();
}
