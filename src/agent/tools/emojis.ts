import {
  type AgentTool,
  auditReason,
  csvField,
  defineTool,
  json,
  strField,
  type ToolContext
} from '@/agent/tools/shared';

const EMOJI_MAX_BYTES = 256 * 1024;

function serializeEmoji(emoji: {
  id: string;
  name: string | null;
  animated: boolean | null;
  managed: boolean;
  available: boolean | null;
  url: string;
  roles: { cache: { keys: () => Iterable<string> } };
}) {
  return {
    id: emoji.id,
    name: emoji.name,
    animated: emoji.animated,
    managed: emoji.managed,
    available: emoji.available,
    url: emoji.url,
    roles: [...emoji.roles.cache.keys()]
  };
}

async function resolveEmojiImage(
  input: Record<string, unknown>
): Promise<Buffer | { error: string }> {
  const url = strField(input, 'imageUrl', 'image_url');
  const image = strField(input, 'image');
  if (url) {
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `Failed to fetch image (${response.status})` };
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > EMOJI_MAX_BYTES) {
      return { error: 'Image exceeds 256KB' };
    }
    return buf;
  }
  if (image) {
    const b64 = image.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) return { error: 'Invalid base64 image' };
    if (buf.length > EMOJI_MAX_BYTES) return { error: 'Image exceeds 256KB' };
    return buf;
  }
  return { error: 'Provide image or imageUrl' };
}

async function listEmojis(_input: Record<string, unknown>, ctx: ToolContext) {
  const emojis = [...ctx.guild.emojis.cache.values()].map((emoji) =>
    serializeEmoji(emoji)
  );
  return json({ count: emojis.length, emojis });
}

async function getEmojiDetails(
  input: Record<string, unknown>,
  ctx: ToolContext
) {
  const emojiId = strField(input, 'emojiId', 'emoji_id');
  if (!emojiId) return json({ error: 'emojiId is required' });
  const emoji =
    ctx.guild.emojis.cache.get(emojiId) ??
    (await ctx.guild.emojis.fetch(emojiId).catch(() => null));
  if (!emoji) return json({ error: `Emoji ${emojiId} not found` });
  return json({ emoji: serializeEmoji(emoji) });
}

async function createEmoji(input: Record<string, unknown>, ctx: ToolContext) {
  const name = strField(input, 'name');
  if (!name) return json({ error: 'name is required' });
  if (!/^[A-Za-z0-9_]{2,32}$/.test(name)) {
    return json({
      error: 'name must be 2-32 characters, alphanumeric and underscores only'
    });
  }
  const image = await resolveEmojiImage(input);
  if ('error' in image) return json(image);
  const created = await ctx.guild.emojis.create({
    attachment: image,
    name,
    roles: csvField(input, 'roles'),
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, emoji: serializeEmoji(created) });
}

async function editEmoji(input: Record<string, unknown>, ctx: ToolContext) {
  const emojiId = strField(input, 'emojiId', 'emoji_id');
  if (!emojiId) return json({ error: 'emojiId is required' });
  const emoji =
    ctx.guild.emojis.cache.get(emojiId) ??
    (await ctx.guild.emojis.fetch(emojiId).catch(() => null));
  if (!emoji) return json({ error: `Emoji ${emojiId} not found` });
  const edited = await emoji.edit({
    name: strField(input, 'name'),
    roles: csvField(input, 'roles'),
    reason: auditReason(ctx, strField(input, 'reason'))
  });
  return json({ ok: true, emoji: serializeEmoji(edited) });
}

async function deleteEmoji(input: Record<string, unknown>, ctx: ToolContext) {
  const emojiId = strField(input, 'emojiId', 'emoji_id');
  if (!emojiId) return json({ error: 'emojiId is required' });
  const emoji =
    ctx.guild.emojis.cache.get(emojiId) ??
    (await ctx.guild.emojis.fetch(emojiId).catch(() => null));
  if (!emoji) return json({ error: `Emoji ${emojiId} not found` });
  await emoji.delete(auditReason(ctx, strField(input, 'reason')));
  return json({ ok: true, id: emojiId, name: emoji.name });
}

export const tools: AgentTool[] = [
  {
    spec: defineTool('list_emojis', 'List all custom emojis on the server', {
      guildId: { type: 'string', description: 'Discord server ID' }
    }),
    run: listEmojis
  },
  {
    spec: defineTool(
      'get_emoji_details',
      'Get detailed information about a specific custom emoji',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        emojiId: { type: 'string', description: 'Emoji ID' }
      },
      ['emojiId']
    ),
    run: getEmojiDetails
  },
  {
    spec: defineTool(
      'create_emoji',
      'Upload a new custom emoji to the server. Provide image as base64 (Data URI or raw) OR a direct image URL. Max 256KB',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        name: {
          type: 'string',
          description:
            'Emoji name (2-32 chars, alphanumeric and underscores only)'
        },
        image: {
          type: 'string',
          description:
            'Image as base64 Data URI (e.g. data:image/png;base64,...) or raw base64 string'
        },
        imageUrl: {
          type: 'string',
          description:
            'Direct URL to the image file (alternative to base64 image)'
        },
        roles: {
          type: 'string',
          description:
            'Comma-separated role IDs to restrict emoji usage (empty = everyone)'
        }
      },
      ['name']
    ),
    run: createEmoji
  },
  {
    spec: defineTool(
      'edit_emoji',
      "Edit an existing emoji's name or role restrictions",
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        emojiId: { type: 'string', description: 'Emoji ID' },
        name: { type: 'string', description: 'New emoji name' },
        roles: {
          type: 'string',
          description: 'Comma-separated role IDs (empty = everyone)'
        }
      },
      ['emojiId']
    ),
    run: editEmoji
  },
  {
    spec: defineTool(
      'delete_emoji',
      'Permanently delete a custom emoji from the server',
      {
        guildId: { type: 'string', description: 'Discord server ID' },
        emojiId: { type: 'string', description: 'Emoji ID' }
      },
      ['emojiId']
    ),
    run: deleteEmoji
  }
];
