import { describe, expect, test } from 'bun:test';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import {
  classifyAttachment,
  dropOldImageBlocks,
  type FetchLike,
  loadAgentImages,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_TURN,
  mediaTypeForAttachment,
  toUserMessageContent,
  uniqueAttachments
} from '@/agent/images';

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function attachment(
  overrides: Partial<{
    id: string;
    name: string;
    size: number;
    url: string;
    contentType: string | null;
  }> = {}
) {
  return {
    id: overrides.id ?? '1',
    name: overrides.name ?? 'shot.png',
    size: overrides.size ?? pngBytes.byteLength,
    url: overrides.url ?? 'https://cdn.example/shot.png',
    contentType:
      overrides.contentType === undefined ? 'image/png' : overrides.contentType
  };
}

describe('mediaTypeForAttachment', () => {
  test('uses content type, including image/jpg', () => {
    expect(mediaTypeForAttachment(attachment())).toBe('image/png');
    expect(
      mediaTypeForAttachment(attachment({ contentType: 'image/jpg' }))
    ).toBe('image/jpeg');
  });

  test('falls back to the file extension', () => {
    expect(
      mediaTypeForAttachment(attachment({ name: 'x.webp', contentType: null }))
    ).toBe('image/webp');
    expect(
      mediaTypeForAttachment(
        attachment({ name: 'clip.mp4', contentType: null })
      )
    ).toBeNull();
  });
});

describe('classifyAttachment', () => {
  test('rejects unsupported types and oversized files', () => {
    expect(
      classifyAttachment(
        attachment({ name: 'a.mp4', contentType: 'video/mp4' })
      )
    ).toEqual({
      ok: false,
      reason: 'unsupported type'
    });
    expect(
      classifyAttachment(attachment({ size: MAX_IMAGE_BYTES + 1 }))
    ).toEqual({ ok: false, reason: 'too large' });
    expect(classifyAttachment(attachment())).toEqual({
      ok: true,
      mediaType: 'image/png'
    });
  });
});

describe('uniqueAttachments', () => {
  test('keeps the first copy of each id', () => {
    const first = attachment({ id: 'a', name: 'one.png' });
    const dup = attachment({ id: 'a', name: 'two.png' });
    const other = attachment({ id: 'b', name: 'other.png' });
    expect(
      uniqueAttachments([first, dup, other]).map((item) => item.name)
    ).toEqual(['one.png', 'other.png']);
  });
});

describe('loadAgentImages', () => {
  test('downloads supported images as base64 and skips the rest', async () => {
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      if (url.endsWith('bad.png')) {
        return new Response('nope', { status: 403 });
      }
      return new Response(pngBytes, {
        headers: { 'content-type': 'image/png' }
      });
    };

    const result = await loadAgentImages(
      [
        attachment({ id: '1', name: 'ok.png' }),
        attachment({ id: '2', name: 'clip.mp4', contentType: 'video/mp4' }),
        attachment({
          id: '3',
          name: 'bad.png',
          url: 'https://cdn.example/bad.png'
        })
      ],
      { fetchImpl }
    );

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.filename).toBe('ok.png');
    expect(result.images[0]?.data).toBe(pngBytes.toString('base64'));
    expect(result.skipped).toEqual([
      { filename: 'clip.mp4', reason: 'unsupported type' },
      { filename: 'bad.png', reason: 'http 403' }
    ]);
  });

  test('caps images per turn', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(pngBytes, { headers: { 'content-type': 'image/png' } });
    const attachments = Array.from(
      { length: MAX_IMAGES_PER_TURN + 1 },
      (_, i) => attachment({ id: String(i), name: `${i}.png` })
    );
    const result = await loadAgentImages(attachments, { fetchImpl });
    expect(result.images).toHaveLength(MAX_IMAGES_PER_TURN);
    expect(result.skipped).toEqual([
      { filename: `${MAX_IMAGES_PER_TURN}.png`, reason: 'limit' }
    ]);
  });
});

describe('toUserMessageContent', () => {
  test('keeps a string when there are no images', () => {
    expect(toUserMessageContent('hello', [])).toBe('hello');
  });

  test('puts images before the text block', () => {
    const content = toUserMessageContent('hello', [
      {
        id: '1',
        filename: 'shot.png',
        mediaType: 'image/png',
        data: 'abc'
      }
    ]);
    expect(content).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'abc' }
      },
      { type: 'text', text: 'hello' }
    ]);
  });
});

describe('dropOldImageBlocks', () => {
  test('keeps only the newest image blocks', () => {
    const older: MessageParam = {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'old' }
        },
        { type: 'text', text: 'old shot' }
      ]
    };
    const newer: MessageParam = {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'new' }
        },
        { type: 'text', text: 'new shot' }
      ]
    };
    expect(dropOldImageBlocks([older, newer], 1)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'old shot' }] },
      newer
    ]);
  });
});
