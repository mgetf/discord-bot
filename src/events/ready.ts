import { Events, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { cacheApplicationOwnerId } from '@/agent/allowlist';
import { getAgentModel } from '@/agent/settings';
import { env } from '@/env';
import type { Event } from '@/types';
import { logger } from '@/utils/logger';
import { refreshManagedStaffRoleIds } from '@/utils/managed-staff-roles';

const log = logger.child({ name: 'events/ready' });

export const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  runOnce: true,
  execute: async (client) => {
    log.info(`Bot ready! Logged in as ${client.user?.tag}`);
    const inviteLink = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions
      ]
    });
    process.env.NODE_ENV !== 'production' &&
      log.info({ inviteLink }, 'Invite Link (Dev Only):');

    try {
      await cacheApplicationOwnerId(client);
    } catch (err) {
      log.error({ err }, 'Failed to cache Discord application owner');
    }

    if (env.ANTHROPIC_API_KEY) {
      log.info(
        {
          allowlist: env.AGENT_ALLOWED_USER_IDS.length,
          model: getAgentModel()
        },
        env.AGENT_ALLOWED_USER_IDS.length > 0
          ? 'AI agent enabled for allowlisted users'
          : 'AI agent enabled for the Discord application owner'
      );
    } else {
      log.warn('AI agent disabled: ANTHROPIC_API_KEY is not set');
    }

    try {
      const roleIds = await refreshManagedStaffRoleIds();
      log.info(
        { count: roleIds.length },
        'Cached managed staff Discord role IDs'
      );
    } catch (err) {
      log.error({ err }, 'Failed to prefetch managed staff role IDs');
    }
  }
};
