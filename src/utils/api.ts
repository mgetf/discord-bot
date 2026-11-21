import { env } from '@/env';
import type { ClaimedOutboxEvent } from '@/outbox/types';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'utils/api' });

export type DiscordLinkResult = {
  steamId: string;
  steamUsername: string;
  discordUsername: string | null;
};

export type UserLookupResult = {
  steamId: string;
  steamUsername: string;
  discordId: string | null;
  discordUsername: string | null;
};

async function postJson(path: string, body: unknown): Promise<Response> {
  const base = env.MGE_API_URL.replace(/\/+$/, '');
  const url = `${base}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MGE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    log.error({ err }, 'Network error calling mge.tf API');
    throw new Error('Could not reach the mge.tf API. Please try again later.');
  }

  if (!res.ok) {
    log.error(
      { status: res.status, url },
      'Unexpected response from mge.tf API'
    );
    throw new Error(
      `mge.tf API returned an unexpected error (HTTP ${res.status}).`
    );
  }
  return res;
}

/**
 * Typed client for the mge.tf external API (v1).
 */
export const mgeApi = {
  /**
   * Look up the mge.tf account linked to a Discord user ID.
   * Returns the account data or null if the user has not linked their account.
   * Throws on network / server errors.
   */
  async getDiscordLink(discordId: string): Promise<DiscordLinkResult | null> {
    const base = env.MGE_API_URL.replace(/\/+$/, '');
    const url = `${base}/api/v1/discord/${encodeURIComponent(discordId)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.MGE_API_KEY}` }
      });
    } catch (err) {
      log.error({ err }, 'Network error calling mge.tf API');
      throw new Error(
        'Could not reach the mge.tf API. Please try again later.'
      );
    }

    if (res.status === 404) return null;

    if (!res.ok) {
      log.error(
        { status: res.status, url },
        'Unexpected response from mge.tf API'
      );
      throw new Error(
        `mge.tf API returned an unexpected error (HTTP ${res.status}).`
      );
    }

    return (await res.json()) as DiscordLinkResult;
  },

  /**
   * Look up an mge.tf user by their Steam ID.
   * Returns the user data (including linked Discord info) or null if not found.
   * Throws on network / server errors.
   */
  async getUserBySteamId(steamId: string): Promise<UserLookupResult | null> {
    const base = env.MGE_API_URL.replace(/\/+$/, '');
    const url = `${base}/api/v1/users/${encodeURIComponent(steamId)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.MGE_API_KEY}` }
      });
    } catch (err) {
      log.error({ err }, 'Network error calling mge.tf API');
      throw new Error(
        'Could not reach the mge.tf API. Please try again later.'
      );
    }

    if (res.status === 404) return null;

    if (!res.ok) {
      log.error(
        { status: res.status, url },
        'Unexpected response from mge.tf API'
      );
      throw new Error(
        `mge.tf API returned an unexpected error (HTTP ${res.status}).`
      );
    }

    return (await res.json()) as UserLookupResult;
  },

  /**
   * Discord role IDs managed by the mge.tf staff hub.
   * Throws on network / server errors.
   */
  async getManagedStaffRoleIds(): Promise<string[]> {
    const base = env.MGE_API_URL.replace(/\/+$/, '');
    const url = `${base}/api/v1/staff/discord-managed-roles`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.MGE_API_KEY}` }
      });
    } catch (err) {
      log.error({ err }, 'Network error calling mge.tf API');
      throw new Error(
        'Could not reach the mge.tf API. Please try again later.'
      );
    }

    if (!res.ok) {
      log.error(
        { status: res.status, url },
        'Unexpected response from mge.tf API'
      );
      throw new Error(catalogHttpError(res.status, url));
    }

    return parseRoleIds(await res.json());
  },

  /**
   * Claim due notification events for delivery. Unacked events return to the
   * queue after the site's lease expires.
   */
  async claimOutbox(limit: number): Promise<ClaimedOutboxEvent[]> {
    const res = await postJson('/api/v1/bot/outbox/claim', { limit });
    const body = (await res.json()) as { events?: ClaimedOutboxEvent[] };
    return Array.isArray(body.events) ? body.events : [];
  },

  /** Report what happened to one claimed event. */
  async ackOutbox(
    id: number,
    result: 'delivered' | 'retry' | 'dead',
    error?: string
  ): Promise<void> {
    await postJson(`/api/v1/bot/outbox/${id}/ack`, { result, error });
  },

  /**
   * Hub-managed Discord role IDs this Discord user should have on mge.tf.
   * Empty array when the user is unlinked or not designated staff.
   */
  async getDesiredStaffRoleIds(discordId: string): Promise<string[]> {
    const base = env.MGE_API_URL.replace(/\/+$/, '');
    const url = `${base}/api/v1/staff/discord-desired-roles/${encodeURIComponent(discordId)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.MGE_API_KEY}` }
      });
    } catch (err) {
      log.error({ err }, 'Network error calling mge.tf API');
      throw new Error(
        'Could not reach the mge.tf API. Please try again later.'
      );
    }

    if (!res.ok) {
      log.error(
        { status: res.status, url },
        'Unexpected response from mge.tf API'
      );
      throw new Error(catalogHttpError(res.status, url));
    }

    return parseRoleIds(await res.json());
  }
};

function parseRoleIds(body: unknown): string[] {
  if (!body || typeof body !== 'object' || !('roleIds' in body)) return [];
  const roleIds = (body as { roleIds?: unknown }).roleIds;
  if (!Array.isArray(roleIds)) return [];
  return roleIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
}

function catalogHttpError(status: number, url: string): string {
  if (status === 404) {
    return `mge.tf is missing ${url} (HTTP 404). Staff Discord role guard cannot run until that API is live.`;
  }
  return `mge.tf API returned an unexpected error (HTTP ${status}).`;
}
