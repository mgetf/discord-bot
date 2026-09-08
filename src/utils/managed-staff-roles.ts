import { mgeApi } from '@/utils/api';
import { logger } from '@/utils/logger';

export {
  managedRoleReconcile,
  roleIdSetsEqual
} from '@/utils/staff-role-diff';

const log = logger.child({ name: 'utils/managed-staff-roles' });

const TTL_MS = 60_000;

let cached: { ids: string[]; fetchedAt: number; ok: boolean } | null = null;

export async function refreshManagedStaffRoleIds(): Promise<string[]> {
  const ids = await mgeApi.getManagedStaffRoleIds();
  cached = { ids, fetchedAt: Date.now(), ok: true };
  return ids;
}

export async function getCachedManagedStaffRoleIds(): Promise<string[]> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.ids;
  }

  try {
    return await refreshManagedStaffRoleIds();
  } catch (err) {
    log.error({ err }, 'Failed to refresh managed staff role IDs');
    cached = {
      ids: cached?.ids ?? [],
      fetchedAt: Date.now(),
      ok: false
    };
    return cached.ids;
  }
}

export function lastManagedRoleCatalogFetchOk(): boolean {
  return cached?.ok === true;
}
