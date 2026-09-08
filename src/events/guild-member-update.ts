import { Events } from 'discord.js';
import { env } from '@/env';
import type { Event } from '@/types';
import { mgeApi } from '@/utils/api';
import { logger } from '@/utils/logger';
import {
  getCachedManagedStaffRoleIds,
  lastManagedRoleCatalogFetchOk,
  managedRoleReconcile,
  roleIdSetsEqual
} from '@/utils/managed-staff-roles';

const log = logger.child({ name: 'events/guild-member-update' });
const REVERT_REASON = 'Staff roles are assigned from mge.tf /admin/staff';

export const event: Event<Events.GuildMemberUpdate> = {
  name: Events.GuildMemberUpdate,
  runOnce: false,
  execute: async (oldMember, newMember) => {
    if (env.DISCORD_GUILD_ID && newMember.guild.id !== env.DISCORD_GUILD_ID) {
      return;
    }

    const currentRoleIds = [...newMember.roles.cache.keys()];
    if (
      !oldMember.partial &&
      roleIdSetsEqual([...oldMember.roles.cache.keys()], currentRoleIds)
    ) {
      return;
    }

    const managedIds = await getCachedManagedStaffRoleIds();
    if (managedIds.length === 0) {
      if (!lastManagedRoleCatalogFetchOk()) {
        log.error(
          { memberId: newMember.id, guildId: newMember.guild.id },
          'Skipping staff role reconcile; managed role catalog is unavailable'
        );
      }
      return;
    }

    let desired: string[];
    try {
      desired = await mgeApi.getDesiredStaffRoleIds(newMember.id);
    } catch (err) {
      log.error(
        { err, memberId: newMember.id },
        'Could not load desired staff Discord roles from mge.tf'
      );
      return;
    }

    const { toAdd, toRemove } = managedRoleReconcile(
      currentRoleIds,
      desired,
      new Set(managedIds)
    );
    if (toAdd.length === 0 && toRemove.length === 0) return;

    try {
      if (toRemove.length > 0) {
        await newMember.roles.remove(toRemove, REVERT_REASON);
      }
      if (toAdd.length > 0) {
        await newMember.roles.add(toAdd, REVERT_REASON);
      }
      log.info(
        {
          memberId: newMember.id,
          guildId: newMember.guild.id,
          toAdd,
          toRemove
        },
        'Reverted Discord staff roles to the mge.tf assignment'
      );
    } catch (err) {
      log.error(
        { err, memberId: newMember.id, toAdd, toRemove },
        'Failed to revert managed Discord staff roles'
      );
    }
  }
};
