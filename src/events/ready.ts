import { Events, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
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
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
      ]
    });
    process.env.NODE_ENV !== 'production' &&
      log.info({ inviteLink }, 'Invite Link (Dev Only):');

    try {
      const roleIds = await refreshManagedStaffRoleIds();
      log.info(
        { count: roleIds.length },
        'Cached managed staff Discord role IDs'
      );
    } catch (err) {
      log.warn({ err }, 'Failed to prefetch managed staff role IDs');
    }
  }
};
