import type { Client, Team, User } from 'discord.js';
import { env } from '@/env';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'agent/allowlist' });

let applicationOwnerId: string | null = null;

export function userIdAllowed(
  userId: string,
  allowlist: readonly string[],
  ownerId: string | null
): boolean {
  if (allowlist.length > 0) return allowlist.includes(userId);
  return ownerId !== null && ownerId === userId;
}

export function isAllowedAgentUser(userId: string): boolean {
  return userIdAllowed(userId, env.AGENT_ALLOWED_USER_IDS, applicationOwnerId);
}

export function getApplicationOwnerId(): string | null {
  return applicationOwnerId;
}

export async function cacheApplicationOwnerId(client: Client): Promise<void> {
  const app = await client.application?.fetch();
  if (!app?.owner) {
    applicationOwnerId = null;
    log.warn('Discord application owner is unavailable');
    return;
  }

  applicationOwnerId = ownerUserId(app.owner);
  log.info({ ownerId: applicationOwnerId }, 'Cached Discord application owner');
}

function ownerUserId(owner: User | Team): string | null {
  if ('members' in owner) return owner.ownerId;
  return owner.id;
}
