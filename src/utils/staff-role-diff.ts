export function roleIdSetsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const previous = new Set(left);
  return right.every((roleId) => previous.has(roleId));
}

export function managedRoleReconcile(
  currentRoleIds: string[],
  desiredManagedRoleIds: string[],
  managedRoleIds: ReadonlySet<string>
): { toAdd: string[]; toRemove: string[] } {
  const currentManaged = new Set(
    currentRoleIds.filter((roleId) => roleId && managedRoleIds.has(roleId))
  );
  const desired = new Set(
    desiredManagedRoleIds.filter(
      (roleId) => roleId && managedRoleIds.has(roleId)
    )
  );

  return {
    toAdd: [...desired].filter((roleId) => !currentManaged.has(roleId)),
    toRemove: [...currentManaged].filter((roleId) => !desired.has(roleId))
  };
}
