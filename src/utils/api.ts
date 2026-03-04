import { env } from '@/env';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'utils/api' });

export type DiscordLinkResult = {
  steamId: string;
  steamUsername: string;
  discordUsername: string | null;
};

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
  }
};
