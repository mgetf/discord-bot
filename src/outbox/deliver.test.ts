import { describe, expect, test } from 'bun:test';
import {
  classifyDeliveryError,
  type DeliveryDeps,
  decideAck,
  deliverEvent
} from '@/outbox/deliver';
import type { ClaimedOutboxEvent } from '@/outbox/types';

const discordError = (code: number) => Object.assign(new Error('x'), { code });

describe('classifyDeliveryError', () => {
  test('sorts discord codes', () => {
    expect(classifyDeliveryError(discordError(50007))).toBe('dm_closed');
    expect(classifyDeliveryError(discordError(10013))).toBe('dm_closed');
    expect(classifyDeliveryError(discordError(50013))).toBe('permanent');
    expect(classifyDeliveryError(discordError(10003))).toBe('permanent');
    expect(classifyDeliveryError(new Error('ECONNRESET'))).toBe('transient');
    expect(classifyDeliveryError('boom')).toBe('transient');
  });
});

describe('decideAck', () => {
  const input = { attempts: 0, hasFallback: false, message: 'm' };
  test('closed DM uses fallback when there is one', () => {
    expect(
      decideAck({ ...input, failure: 'dm_closed', hasFallback: true })
    ).toEqual({
      result: 'delivered',
      useFallback: true
    });
  });
  test('closed DM with no fallback is dead', () => {
    expect(decideAck({ ...input, failure: 'dm_closed' }).result).toBe('dead');
  });
  test('permanent failures are dead', () => {
    expect(decideAck({ ...input, failure: 'permanent' }).result).toBe('dead');
  });
  test('transient failures retry, then give up', () => {
    expect(decideAck({ ...input, failure: 'transient' }).result).toBe('retry');
    expect(
      decideAck({ ...input, failure: 'transient', attempts: 7 }).result
    ).toBe('dead');
  });
});

const dmPayload = {
  target: { type: 'dm', discordId: '111', steamId: '765' },
  fallbackChannel: 'playoffs',
  url: 'https://mge.tf/matches/1',
  division: 'Premier',
  round: null,
  home: { id: 1, name: 'A' },
  away: { id: 2, name: 'B' },
  bestOf: 3,
  arenaGames: 3,
  recipientSide: 'home'
};
const event = (over: Partial<ClaimedOutboxEvent> = {}): ClaimedOutboxEvent => ({
  id: 1,
  kind: 'playoff.match_created',
  attempts: 0,
  payload: dmPayload,
  ...over
});

const deps = (
  over: Partial<DeliveryDeps> = {}
): DeliveryDeps & {
  calls: string[];
} => {
  const calls: string[] = [];
  return {
    calls,
    isChannelConfigured: () => true,
    sendDm: async (id) => {
      calls.push(`dm:${id}`);
    },
    sendChannel: async (channel, _m, mention) => {
      calls.push(`channel:${channel}:${mention ?? ''}`);
    },
    ...over
  };
};

describe('deliverEvent', () => {
  test('posts to the region channel when the site names one', async () => {
    const seen: Array<string | null | undefined> = [];
    const d = deps({
      isChannelConfigured: (_c, id) => !!id,
      sendChannel: async (_c, _m, _mention, id) => {
        seen.push(id);
      }
    });
    const channelEvent = event({
      payload: {
        ...dmPayload,
        target: { type: 'channel', channel: 'playoffs', channelId: '999' }
      }
    });
    expect(await deliverEvent(channelEvent, d)).toEqual({
      result: 'delivered'
    });
    expect(seen).toEqual(['999']);
  });

  test('uses the region channel for the closed-DM mention too', async () => {
    const seen: Array<string | null | undefined> = [];
    const d = deps({
      sendDm: async () => {
        throw discordError(50007);
      },
      sendChannel: async (_c, _m, _mention, id) => {
        seen.push(id);
      }
    });
    const withRegion = event({
      payload: { ...dmPayload, fallbackChannelId: '888' }
    });
    expect(await deliverEvent(withRegion, d)).toEqual({ result: 'delivered' });
    expect(seen).toEqual(['888']);
  });

  test('delivers a DM', async () => {
    const d = deps();
    expect(await deliverEvent(event(), d)).toEqual({ result: 'delivered' });
    expect(d.calls).toEqual(['dm:111']);
  });

  test('falls back to a channel mention when DMs are closed', async () => {
    const d = deps({
      sendDm: async () => {
        throw discordError(50007);
      }
    });
    expect(await deliverEvent(event(), d)).toEqual({ result: 'delivered' });
    expect(d.calls).toEqual(['channel:playoffs:111']);
  });

  test('closed DM is dead when the fallback channel is not configured', async () => {
    const d = deps({
      isChannelConfigured: () => false,
      sendDm: async () => {
        throw discordError(50007);
      }
    });
    expect((await deliverEvent(event(), d)).result).toBe('dead');
  });

  test('network errors retry', async () => {
    const d = deps({
      sendDm: async () => {
        throw new Error('fetch failed');
      }
    });
    expect((await deliverEvent(event(), d)).result).toBe('retry');
  });

  test('unconfigured channel target is skipped as delivered', async () => {
    const d = deps({ isChannelConfigured: () => false });
    const out = await deliverEvent(
      event({
        payload: { ...dmPayload, target: { type: 'channel', channel: 'staff' } }
      }),
      d
    );
    expect(out).toEqual({ result: 'delivered' });
    expect(d.calls).toEqual([]);
  });

  test('unknown kind and bad payload are dead', async () => {
    expect((await deliverEvent(event({ kind: 'x' }), deps())).result).toBe(
      'dead'
    );
    expect((await deliverEvent(event({ payload: {} }), deps())).result).toBe(
      'dead'
    );
  });
});

describe('deliverEvent message id', () => {
  test('passes back the id of the DM it sent', async () => {
    const d = deps({ sendDm: async () => '4242' });
    expect(await deliverEvent(event(), d)).toEqual({
      result: 'delivered',
      messageId: '4242'
    });
  });
});
