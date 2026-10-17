import { type PermissionResolvable, PermissionsBitField } from 'discord.js';
import { parsePermissionCsv } from '@/agent/permissions';
import {
  type AgentTool,
  auditReason,
  boolField,
  defineTool,
  intField,
  json,
  resolveMember,
  resolveRole,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

function serializeRole(
  role: NonNullable<Awaited<ReturnType<typeof resolveRole>>>
) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    managed: role.managed,
    position: role.position,
    permissions: role.permissions.bitfield.toString()
  };
}

function parseRolePermissions(raw: string | undefined) {
  if (raw === undefined || raw === '') return undefined;
  if (/^\d+$/.test(raw)) {
    try {
      return new PermissionsBitField(BigInt(raw));
    } catch {
      return { error: 'Invalid permissions bitfield' };
    }
  }
  const parsed = parsePermissionCsv(raw);
  if (parsed.unknown.length > 0) {
    return { error: 'Unknown permission names', unknown: parsed.unknown };
  }
  return new PermissionsBitField(parsed.names as PermissionResolvable);
}

async function listRoles(_input: Record<string, unknown>, ctx: ToolContext) {
  const roles = [...ctx.guild.roles.cache.values()]
    .sort((a, b) => b.position - a.position)
    .map((role) => serializeRole(role));
  return json({ count: roles.length, roles });
}

async function createRole(input: Record<string, unknown>, ctx: ToolContext) {
  const name = strField(input, 'name');
  if (!name) return json({ error: 'name is required' });
  const permissions = parseRolePermissions(strField(input, 'permissions'));
  if (permissions && 'error' in permissions) return json(permissions);
  const created = await ctx.guild.roles.create({
    name,
    color: intField(input, 'color'),
    hoist: boolField(input, 'hoist') ?? false,
    mentionable: boolField(input, 'mentionable') ?? false,
    permissions,
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, role: serializeRole(created) });
}

async function editRole(input: Record<string, unknown>, ctx: ToolContext) {
  const roleId = strField(input, 'roleId', 'role_id');
  if (!roleId) return json({ error: 'roleId is required' });
  const role = await resolveRole(ctx, roleId);
  if (!role) return json({ error: `Role ${roleId} not found` });
  const permissions = parseRolePermissions(strField(input, 'permissions'));
  if (permissions && 'error' in permissions) return json(permissions);
  const edited = await role.edit({
    name: strField(input, 'name'),
    color: intField(input, 'color'),
    hoist: boolField(input, 'hoist'),
    mentionable: boolField(input, 'mentionable'),
    permissions,
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, role: serializeRole(edited) });
}

async function deleteRole(input: Record<string, unknown>, ctx: ToolContext) {
  const roleId = strField(input, 'roleId', 'role_id');
  if (!roleId) return json({ error: 'roleId is required' });
  const role = await resolveRole(ctx, roleId);
  if (!role) return json({ error: `Role ${roleId} not found` });
  await role.delete(auditReason(ctx, strField(input, 'reason')));
  return json({ ok: true, id: roleId, name: role.name });
}

async function assignRole(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  const roleId = strField(input, 'roleId', 'role_id');
  if (!userId || !roleId) {
    return json({ error: 'userId and roleId are required' });
  }
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  const role = await resolveRole(ctx, roleId);
  if (!role) return json({ error: `Role ${roleId} not found` });
  await member.roles.add(role, auditReason(ctx, strField(input, 'reason')));
  return json({
    ok: true,
    userId: member.id,
    role: { id: role.id, name: role.name }
  });
}

async function removeRole(input: Record<string, unknown>, ctx: ToolContext) {
  const userId = strField(input, 'userId', 'user_id');
  const roleId = strField(input, 'roleId', 'role_id');
  if (!userId || !roleId) {
    return json({ error: 'userId and roleId are required' });
  }
  const member = await resolveMember(ctx, userId);
  if (!member) return json({ error: `Member ${userId} not found` });
  const role = await resolveRole(ctx, roleId);
  if (!role) return json({ error: `Role ${roleId} not found` });
  await member.roles.remove(role, auditReason(ctx, strField(input, 'reason')));
  return json({
    ok: true,
    userId: member.id,
    role: { id: role.id, name: role.name }
  });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'list_roles',
      'Returns a list of all roles on the server along with their ID, names, colors, positions, and permissions',
      {
        guildId: { type: 'string', description: 'Discord server ID' }
      }
    ),
    run: listRoles
  },
  {
    spec: defineTool(
      'create_role',
      'Creates a new role on the server with specified parameters',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        name: { type: 'string', description: 'Name of the new role' },
        color: {
          type: 'string',
          description: 'Color value as integer (e.g., 16711680 for red)'
        },
        hoist: {
          type: 'string',
          description: 'Whether the role should be displayed separately'
        },
        mentionable: {
          type: 'string',
          description: 'Whether the role should be mentionable'
        },
        permissions: {
          type: 'string',
          description:
            'Permissions bitfield as string, or CSV of names such as SendMessages'
        }
      },
      ['name']
    ),
    run: createRole
  },
  {
    spec: defineTool(
      'edit_role',
      'Updates settings of an existing role. All parameters except guildId and roleId are optional',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        roleId: { type: 'string', description: 'ID of the role to edit' },
        name: { type: 'string', description: 'New name for the role' },
        color: { type: 'string', description: 'New color value as integer' },
        hoist: { type: 'string', description: 'New hoist setting' },
        mentionable: { type: 'string', description: 'New mentionable setting' },
        permissions: {
          type: 'string',
          description: 'New permissions bitfield as string, or CSV of names'
        }
      },
      ['roleId']
    ),
    run: editRole
  },
  {
    spec: defineTool(
      'delete_role',
      'Permanently deletes a role from the server',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        roleId: { type: 'string', description: 'ID of the role to delete' }
      },
      ['roleId']
    ),
    run: deleteRole
  },
  {
    spec: defineTool(
      'assign_role',
      'Assigns a specified role to a user',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: {
          type: 'string',
          description: 'ID of the user to receive the role'
        },
        roleId: { type: 'string', description: 'ID of the role to assign' }
      },
      ['userId', 'roleId']
    ),
    run: assignRole
  },
  {
    spec: defineTool(
      'remove_role',
      'Removes a specified role from a user',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        userId: {
          type: 'string',
          description: 'ID of the user from whom to remove the role'
        },
        roleId: { type: 'string', description: 'ID of the role to remove' }
      },
      ['userId', 'roleId']
    ),
    run: removeRole
  }
];
