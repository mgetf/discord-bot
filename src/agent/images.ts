import type {
  ImageBlockParam,
  MessageParam
} from '@anthropic-ai/sdk/resources/messages';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'agent/images' });

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_TURN = 4;
export const IMAGE_FETCH_TIMEOUT_MS = 15_000;

export const AGENT_IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
] as const;

export type AgentImageMediaType = (typeof AGENT_IMAGE_MEDIA_TYPES)[number];

export type AttachmentLike = {
  id: string;
  name: string;
  size: number;
  url: string;
  contentType: string | null;
};

export type AgentImage = {
  id: string;
  filename: string;
  mediaType: AgentImageMediaType;
  data: string;
};

export type SkippedAttachment = {
  filename: string;
  reason: string;
};

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<Response>;

export type LoadAgentImagesResult = {
  images: AgentImage[];
  skipped: SkippedAttachment[];
};

const MEDIA_TYPES = new Set<string>(AGENT_IMAGE_MEDIA_TYPES);

const EXTENSION_MEDIA: Record<string, AgentImageMediaType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
};

export function uniqueAttachments(
  attachments: AttachmentLike[]
): AttachmentLike[] {
  const seen = new Set<string>();
  const unique: AttachmentLike[] = [];
  for (const attachment of attachments) {
    if (seen.has(attachment.id)) continue;
    seen.add(attachment.id);
    unique.push(attachment);
  }
  return unique;
}

export function mediaTypeForAttachment(
  attachment: Pick<AttachmentLike, 'name' | 'contentType'>
): AgentImageMediaType | null {
  const fromHeader = normalizeMediaType(attachment.contentType);
  if (fromHeader) return fromHeader;
  const ext = attachment.name.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return EXTENSION_MEDIA[ext] ?? null;
}

export function classifyAttachment(
  attachment: AttachmentLike
):
  | { ok: true; mediaType: AgentImageMediaType }
  | { ok: false; reason: string } {
  const mediaType = mediaTypeForAttachment(attachment);
  if (!mediaType) return { ok: false, reason: 'unsupported type' };
  if (attachment.size > MAX_IMAGE_BYTES)
    return { ok: false, reason: 'too large' };
  return { ok: true, mediaType };
}

export async function loadAgentImages(
  attachments: AttachmentLike[],
  options: { fetchImpl?: FetchLike; authToken?: string } = {}
): Promise<LoadAgentImagesResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const images: AgentImage[] = [];
  const skipped: SkippedAttachment[] = [];

  for (const attachment of uniqueAttachments(attachments)) {
    if (images.length >= MAX_IMAGES_PER_TURN) {
      skipped.push({ filename: attachment.name, reason: 'limit' });
      continue;
    }

    const classified = classifyAttachment(attachment);
    if (!classified.ok) {
      skipped.push({ filename: attachment.name, reason: classified.reason });
      continue;
    }

    try {
      const loaded = await downloadImage(
        attachment,
        classified.mediaType,
        fetchImpl,
        options.authToken
      );
      if (!loaded.ok) {
        skipped.push({ filename: attachment.name, reason: loaded.reason });
        continue;
      }
      images.push(loaded.image);
    } catch (err) {
      log.warn({ err, name: attachment.name }, 'Failed to download image');
      skipped.push({ filename: attachment.name, reason: 'download failed' });
    }
  }

  return { images, skipped };
}

export function toImageBlocks(images: AgentImage[]): ImageBlockParam[] {
  return images.map((image) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: image.mediaType,
      data: image.data
    }
  }));
}

export function toUserMessageContent(
  text: string,
  images: AgentImage[]
): MessageParam['content'] {
  if (images.length === 0) return text;
  return [...toImageBlocks(images), { type: 'text', text }];
}

export function dropOldImageBlocks(
  messages: MessageParam[],
  keep = MAX_IMAGES_PER_TURN
): MessageParam[] {
  let remaining = keep;
  const next: MessageParam[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.role !== 'user' || !Array.isArray(message.content)) {
      next.push(message);
      continue;
    }

    const kept: typeof message.content = [];
    for (const block of message.content) {
      if (!isImageBlock(block)) {
        kept.push(block);
        continue;
      }
      if (remaining > 0) {
        kept.push(block);
        remaining -= 1;
      }
    }
    next.push({
      ...message,
      content: kept.length > 0 ? kept : '(image omitted)'
    });
  }

  return next.reverse();
}

function isImageBlock(block: unknown): block is ImageBlockParam {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    block.type === 'image'
  );
}

function normalizeMediaType(
  value: string | null | undefined
): AgentImageMediaType | null {
  if (!value) return null;
  const raw = value.split(';')[0]?.trim().toLowerCase();
  if (!raw) return null;
  const mapped = raw === 'image/jpg' ? 'image/jpeg' : raw;
  return MEDIA_TYPES.has(mapped) ? (mapped as AgentImageMediaType) : null;
}

async function downloadImage(
  attachment: AttachmentLike,
  fallbackType: AgentImageMediaType,
  fetchImpl: FetchLike,
  authToken?: string
): Promise<{ ok: true; image: AgentImage } | { ok: false; reason: string }> {
  const response = await fetchWithTimeout(fetchImpl, attachment.url, authToken);
  if (!response.ok) {
    return { ok: false, reason: `http ${response.status}` };
  }

  const headerType = normalizeMediaType(response.headers.get('content-type'));
  const mediaType = headerType ?? fallbackType;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) return { ok: false, reason: 'empty' };
  if (buffer.byteLength > MAX_IMAGE_BYTES)
    return { ok: false, reason: 'too large' };

  return {
    ok: true,
    image: {
      id: attachment.id,
      filename: attachment.name,
      mediaType,
      data: buffer.toString('base64')
    }
  };
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  authToken?: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  const headers: Record<string, string> = {
    'User-Agent': 'mgetf-discord-bot'
  };
  if (authToken) headers.Authorization = `Bot ${authToken}`;
  try {
    return await fetchImpl(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timer);
  }
}
