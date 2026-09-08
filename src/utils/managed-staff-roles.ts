import { mgeApi } from '@/utils/api';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'utils/managed-staff-roles' });

const TTL_MS = 60_000;

let cached: { ids: string[]; fetchedAt: number } | null = null;

export function addedManagedRoleIds(
  oldRoleIds: string[],
  newRoleIds: string[],
  managedRoleIds: ReadonlySet<string>
): string[] {
  const previous = new Set(oldRoleIds);
  const added = newRoleIds.filter((roleId) => roleId && !previous.has(roleId));
  return added.filter((roleId) => managedRoleIds.has(roleId));
}

export async function refreshManagedStaffRoleIds(): Promise<string[]> {
  const ids = await mgeApi.getManagedStaffRoleIds();
  cached = { ids, fetchedAt: Date.now() };
  return ids;
}

export async function getCachedManagedStaffRoleIds(): Promise<string[]> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.ids;
  }

  try {
    return await refreshManagedStaffRoleIds();
  } catch (err) {
    log.warn({ err }, 'Failed to refresh managed staff role IDs');
    return cached?.ids ?? [];
  }
}
