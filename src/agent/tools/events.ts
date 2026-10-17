import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus
} from 'discord.js';
import {
  type AgentTool,
  boolField,
  defineTool,
  intField,
  json,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

function parseEntityType(
  raw: string | undefined
): GuildScheduledEventEntityType | { error: string } {
  if (!raw) return { error: 'entityType is required' };
  const n = Number(raw);
  if (n === 1 || raw.toLowerCase() === 'stage') {
    return GuildScheduledEventEntityType.StageInstance;
  }
  if (n === 2 || raw.toLowerCase() === 'voice') {
    return GuildScheduledEventEntityType.Voice;
  }
  if (n === 3 || raw.toLowerCase() === 'external') {
    return GuildScheduledEventEntityType.External;
  }
  return { error: 'entityType must be 1 (Stage), 2 (Voice), or 3 (External)' };
}

function parseStatus(
  raw: string | undefined
):
  | GuildScheduledEventStatus.Active
  | GuildScheduledEventStatus.Completed
  | GuildScheduledEventStatus.Canceled
  | undefined
  | { error: string } {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (n === 1 || raw.toLowerCase() === 'scheduled') {
    return {
      error:
        'Cannot set status back to Scheduled; use Active, Completed, or Canceled'
    };
  }
  if (n === 2 || raw.toLowerCase() === 'active') {
    return GuildScheduledEventStatus.Active;
  }
  if (n === 3 || raw.toLowerCase() === 'completed') {
    return GuildScheduledEventStatus.Completed;
  }
  if (
    n === 4 ||
    raw.toLowerCase() === 'canceled' ||
    raw.toLowerCase() === 'cancelled'
  ) {
    return GuildScheduledEventStatus.Canceled;
  }
  return { error: 'status must be 2-4 (Active, Completed, Canceled)' };
}

function serializeEvent(event: {
  id: string;
  name: string;
  description: string | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  status: GuildScheduledEventStatus;
  entityType: GuildScheduledEventEntityType;
  channelId: string | null;
  userCount: number | null;
  url: string;
}) {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    scheduledStartTime: event.scheduledStartAt?.toISOString() ?? null,
    scheduledEndTime: event.scheduledEndAt?.toISOString() ?? null,
    status: GuildScheduledEventStatus[event.status] ?? event.status,
    entityType:
      GuildScheduledEventEntityType[event.entityType] ?? event.entityType,
    channelId: event.channelId,
    userCount: event.userCount,
    url: event.url
  };
}

async function createEvent(input: Record<string, unknown>, ctx: ToolContext) {
  const name = strField(input, 'name');
  const start = strField(input, 'scheduledStartTime', 'scheduled_start_time');
  const entityType = parseEntityType(
    strField(input, 'entityType', 'entity_type')
  );
  if (!name) return json({ error: 'name is required' });
  if (!start) return json({ error: 'scheduledStartTime is required' });
  if (typeof entityType === 'object' && 'error' in entityType)
    return json(entityType);

  const end = strField(input, 'scheduledEndTime', 'scheduled_end_time');
  const channelId = strField(input, 'channelId', 'channel_id');
  const location = strField(input, 'location');

  if (entityType === GuildScheduledEventEntityType.External) {
    if (!location)
      return json({ error: 'location is required for External events' });
    if (!end)
      return json({
        error: 'scheduledEndTime is required for External events'
      });
  } else if (!channelId) {
    return json({ error: 'channelId is required for Stage and Voice events' });
  }

  const created = await ctx.guild.scheduledEvents.create({
    name,
    description: strField(input, 'description'),
    scheduledStartTime: new Date(start),
    scheduledEndTime: end ? new Date(end) : undefined,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType,
    channel:
      entityType === GuildScheduledEventEntityType.External
        ? undefined
        : channelId,
    entityMetadata:
      entityType === GuildScheduledEventEntityType.External && location
        ? { location }
        : undefined
  });
  return json({ ok: true, event: serializeEvent(created) });
}

async function editEvent(input: Record<string, unknown>, ctx: ToolContext) {
  const eventId = strField(input, 'eventId', 'event_id');
  if (!eventId) return json({ error: 'eventId is required' });
  const event = await ctx.guild.scheduledEvents.fetch(eventId);
  const status = parseStatus(strField(input, 'status'));
  if (status && typeof status === 'object' && 'error' in status)
    return json(status);
  const location = strField(input, 'location');
  const edited = await event.edit({
    name: strField(input, 'name'),
    description: strField(input, 'description'),
    scheduledStartTime: strField(
      input,
      'scheduledStartTime',
      'scheduled_start_time'
    ),
    status,
    entityMetadata: location ? { location } : undefined
  });
  return json({ ok: true, event: serializeEvent(edited) });
}

async function deleteEvent(input: Record<string, unknown>, ctx: ToolContext) {
  const eventId = strField(input, 'eventId', 'event_id');
  if (!eventId) return json({ error: 'eventId is required' });
  const event = await ctx.guild.scheduledEvents.fetch(eventId);
  await event.delete();
  return json({ ok: true, id: eventId, name: event.name });
}

async function listEvents(input: Record<string, unknown>, ctx: ToolContext) {
  const withUserCount =
    boolField(input, 'withUserCount', 'with_user_count') ?? true;
  const events = await ctx.guild.scheduledEvents.fetch({ withUserCount });
  const rows = [...events.values()].map((event) => serializeEvent(event));
  return json({ count: rows.length, events: rows });
}

async function listEventUsers(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const eventId = strField(input, 'eventId', 'event_id');
  if (!eventId) return json({ error: 'eventId is required' });
  const event = await ctx.guild.scheduledEvents.fetch(eventId);
  const limit = Math.min(Math.max(intField(input, 'limit') ?? 100, 1), 100);
  const subscribers = await event.fetchSubscribers({ limit });
  const users = [...subscribers.values()].map((entry) => ({
    userId: entry.user.id,
    username: entry.user.username
  }));
  return json({ eventId, count: users.length, users });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool(
      'create_guild_scheduled_event',
      'Schedule a new event on the server (voice, stage, or external)',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        name: { type: 'string', description: 'Name of the event' },
        description: {
          type: 'string',
          description: 'Description of the event'
        },
        scheduledStartTime: {
          type: 'string',
          description: 'ISO8601 timestamp for when the event starts'
        },
        scheduledEndTime: {
          type: 'string',
          description:
            'ISO8601 timestamp for when the event ends (Required for External events)'
        },
        entityType: {
          type: 'string',
          description: 'Type of event: 1=Stage Instance, 2=Voice, 3=External'
        },
        channelId: {
          type: 'string',
          description: 'Channel ID (Required for types 1 and 2)'
        },
        location: {
          type: 'string',
          description: 'Location or link (Required for type 3 - External)'
        }
      },
      ['name', 'scheduledStartTime', 'entityType']
    ),
    run: createEvent
  },
  {
    spec: defineTool(
      'edit_guild_scheduled_event',
      'Modify details of an existing event or change its status (start, complete, cancel)',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        eventId: { type: 'string', description: 'ID of the scheduled event' },
        status: {
          type: 'string',
          description:
            'New status: 1=Scheduled, 2=Active (start), 3=Completed, 4=Canceled'
        },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        scheduledStartTime: {
          type: 'string',
          description: 'New ISO8601 start time'
        },
        location: {
          type: 'string',
          description: 'New location (for External events)'
        }
      },
      ['eventId']
    ),
    run: editEvent
  },
  {
    spec: defineTool(
      'delete_guild_scheduled_event',
      'Permanently delete a scheduled event',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        eventId: { type: 'string', description: 'ID of the scheduled event' }
      },
      ['eventId']
    ),
    run: deleteEvent
  },
  {
    spec: defineTool(
      'list_guild_scheduled_events',
      'List all active and scheduled events on the server',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        withUserCount: {
          type: 'string',
          description: 'Whether to include interested user count (default true)'
        }
      }
    ),
    run: listEvents
  },
  {
    spec: defineTool(
      'get_guild_scheduled_event_users',
      'Get list of users interested in a scheduled event',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        eventId: { type: 'string', description: 'ID of the scheduled event' },
        limit: {
          type: 'string',
          description: 'Max number of users to return (default 100)'
        },
        withMember: {
          type: 'string',
          description:
            'Whether to include full member data with roles (default true)'
        }
      },
      ['eventId']
    ),
    run: listEventUsers
  }
];
