import { AuditLogEvent, Events } from 'discord.js';
import { env } from '@/env';
import type { Event } from '@/types';
import { logger } from '@/utils/logger';
import {
  addedManagedRoleIds,
  getCachedManagedStaffRoleIds
} from '@/utils/managed-staff-roles';

const log = logger.child({ name: 'events/guild-member-update' });
const AUDIT_WAIT_MS = 800;
const AUDIT_MAX_AGE_MS = 10_000;
const MANAGED_ROLE_DM =
  'That Discord role is managed on mge.tf and must be assigned at /admin/staff.';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const event: Event<Events.GuildMemberUpdate> = {
  name: Events.GuildMemberUpdate,
  runOnce: false,
  execute: async (oldMember, newMember) => {
    if (oldMember.partial) return;
    if (env.DISCORD_GUILD_ID && newMember.guild.id !== env.DISCORD_GUILD_ID) {
      return;
    }

    const managed = new Set(await getCachedManagedStaffRoleIds());
    if (managed.size === 0) return;

    const added = addedManagedRoleIds(
      [...oldMember.roles.cache.keys()],
      [...newMember.roles.cache.keys()],
      managed
    );
    if (added.length === 0) return;

    await sleep(AUDIT_WAIT_MS);

    let executorId: string | null = null;
    try {
      const logs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 10
      });
      const entry = logs.entries.find((logEntry) => {
        if (logEntry.targetId !== newMember.id) return false;
        if (Date.now() - logEntry.createdTimestamp > AUDIT_MAX_AGE_MS)
          return false;
        const addedChange = logEntry.changes.find(
          (change) => change.key === '$add'
        );
        if (!addedChange || !Array.isArray(addedChange.new)) return false;
        const addedIds = (addedChange.new as Array<{ id?: string }>)
          .map((role) => role.id)
          .filter((id): id is string => typeof id === 'string');
        return added.some((roleId) => addedIds.includes(roleId));
      });
      executorId = entry?.executorId ?? null;
    } catch (err) {
      log.warn(
        { err, guildId: newMember.guild.id, memberId: newMember.id },
        'Could not fetch MemberRoleUpdate audit logs'
      );
    }

    if (executorId && executorId === newMember.client.user?.id) {
      return;
    }

    try {
      await newMember.roles.remove(
        added,
        'Staff roles must be assigned from mge.tf /admin/staff'
      );
    } catch (err) {
      log.error(
        { err, memberId: newMember.id, added },
        'Failed to revert managed Discord staff roles'
      );
      return;
    }

    if (!executorId) {
      log.info(
        { memberId: newMember.id, added, guildId: newMember.guild.id },
        'Reverted managed staff roles without an audit executor'
      );
      return;
    }

    try {
      const executor = await newMember.client.users.fetch(executorId);
      await executor.send(MANAGED_ROLE_DM);
    } catch (err) {
      log.warn(
        { err, executorId, memberId: newMember.id, added },
        'Reverted managed staff roles but could not DM the executor'
      );
    }
  }
};
