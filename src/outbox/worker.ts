import type { Client } from 'discord.js';
import { env } from '@/env';
import { type DeliveryDeps, deliverEvent } from '@/outbox/deliver';
import type { OutboxChannel } from '@/outbox/types';
import { mgeApi } from '@/utils/api';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'outbox/worker' });

const BATCH_SIZE = 20;
const SEND_DELAY_MS = 250;
const MAX_BACKOFF_MS = 60_000;

const channelId = (channel: OutboxChannel): string | undefined =>
  channel === 'staff' ? env.STAFF_CHANNEL_ID : env.PLAYOFFS_CHANNEL_ID;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const buildDeps = (client: Client): DeliveryDeps => ({
  isChannelConfigured: (channel, regionChannelId) =>
    !!(regionChannelId || channelId(channel)),
  sendDm: async (discordId, message) => {
    const user = await client.users.fetch(discordId);
    await user.send({ ...message, allowedMentions: { parse: [] } });
  },
  sendChannel: async (channel, message, mentionUserId, regionChannelId) => {
    const id = regionChannelId || channelId(channel);
    if (!id) return;
    const target = await client.channels.fetch(id);
    if (!target?.isSendable()) {
      throw Object.assign(new Error(`Channel ${id} is not sendable`), {
        code: 10003
      });
    }
    await target.send({
      ...message,
      content: mentionUserId ? `<@${mentionUserId}>` : undefined,
      allowedMentions: mentionUserId
        ? { users: [mentionUserId] }
        : { parse: [] }
    });
  }
});

/**
 * Polls the site for outbox events and delivers them. Ticks never overlap and
 * one bad event never stops the loop. Returns a function that stops it.
 */
export const startOutboxWorker = (client: Client): (() => void) => {
  if (!env.OUTBOX_ENABLED) {
    log.info('Outbox worker disabled (OUTBOX_ENABLED=false)');
    return () => {};
  }

  const deps = buildDeps(client);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let apiFailures = 0;

  const tick = async () => {
    let wait = env.OUTBOX_POLL_MS;
    try {
      const events = await mgeApi.claimOutbox(BATCH_SIZE);
      apiFailures = 0;
      for (const event of events) {
        if (stopped) break;
        const outcome = await deliverEvent(event, deps);
        try {
          await mgeApi.ackOutbox(event.id, outcome.result, outcome.error);
        } catch (err) {
          // Unacked rows return to the queue when the site's lease runs out.
          log.error({ err, eventId: event.id }, 'Failed to ack outbox event');
        }
        if (outcome.result !== 'delivered') {
          log.warn(
            { eventId: event.id, kind: event.kind, ...outcome },
            'Outbox event not delivered'
          );
        }
        await sleep(SEND_DELAY_MS);
      }
      // A full batch means more is waiting, so go again right away.
      if (events.length >= BATCH_SIZE) wait = 0;
    } catch (err) {
      apiFailures += 1;
      wait = Math.min(env.OUTBOX_POLL_MS * 2 ** apiFailures, MAX_BACKOFF_MS);
      log.error({ err, retryInMs: wait }, 'Outbox poll failed');
    }
    if (!stopped) timer = setTimeout(tick, wait);
  };

  log.info({ pollMs: env.OUTBOX_POLL_MS }, 'Outbox worker started');
  timer = setTimeout(tick, 0);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
};
