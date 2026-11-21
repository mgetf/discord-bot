import {
  type OutboxMessage,
  parseBase,
  renderOutboxEvent
} from '@/outbox/render';
import type {
  ClaimedOutboxEvent,
  OutboxAckResult,
  OutboxChannel
} from '@/outbox/types';

/** Matches the site's OUTBOX_MAX_ATTEMPTS: the site gives up after this many tries. */
export const MAX_ATTEMPTS = 8;

export type DeliveryFailure = 'dm_closed' | 'permanent' | 'transient';

// Discord JSON error codes.
const CANNOT_DM = 50007;
const UNKNOWN_USER = 10013;
const UNKNOWN_CHANNEL = 10003;
const MISSING_ACCESS = 50001;
const MISSING_PERMISSIONS = 50013;

const errorCode = (err: unknown): number | null => {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'number' ? code : null;
};

/** Sorts a Discord send error into what the worker should do about it. */
export const classifyDeliveryError = (err: unknown): DeliveryFailure => {
  const code = errorCode(err);
  if (code === CANNOT_DM || code === UNKNOWN_USER) return 'dm_closed';
  if (
    code === UNKNOWN_CHANNEL ||
    code === MISSING_ACCESS ||
    code === MISSING_PERMISSIONS
  ) {
    return 'permanent';
  }
  return 'transient';
};

export type AckDecision = {
  result: OutboxAckResult;
  error?: string;
  /** Post in the fallback channel instead of giving up on a closed DM. */
  useFallback: boolean;
};

export const decideAck = (input: {
  failure: DeliveryFailure;
  attempts: number;
  hasFallback: boolean;
  message: string;
}): AckDecision => {
  const { failure, attempts, hasFallback, message } = input;
  if (failure === 'dm_closed') {
    return hasFallback
      ? { result: 'delivered', useFallback: true }
      : {
          result: 'dead',
          error: `DM not possible: ${message}`,
          useFallback: false
        };
  }
  if (failure === 'permanent') {
    return { result: 'dead', error: message, useFallback: false };
  }
  if (attempts + 1 >= MAX_ATTEMPTS) {
    return {
      result: 'dead',
      error: `gave up after ${attempts + 1} attempts: ${message}`,
      useFallback: false
    };
  }
  return { result: 'retry', error: message, useFallback: false };
};

export type DeliveryDeps = {
  /** `channelId` is the region's own channel, which wins over the bot's default. */
  isChannelConfigured: (
    channel: OutboxChannel,
    channelId?: string | null
  ) => boolean;
  /** Resolves with the id of the DM that was sent, when the sender knows it. */
  sendDm: (
    discordId: string,
    message: OutboxMessage
  ) => Promise<string | undefined | void>;
  /** `mentionUserId` is set only for the closed-DM fallback post. */
  sendChannel: (
    channel: OutboxChannel,
    message: OutboxMessage,
    mentionUserId?: string,
    channelId?: string | null
  ) => Promise<void>;
};

export type DeliveryOutcome = {
  result: OutboxAckResult;
  error?: string;
  /** The DM that was sent, so a reply to it can be tied back to this event. */
  messageId?: string;
};

const messageOf = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, 500);

/** Sends one claimed event and says how to ack it. Never throws. */
export const deliverEvent = async (
  event: ClaimedOutboxEvent,
  deps: DeliveryDeps
): Promise<DeliveryOutcome> => {
  const message = renderOutboxEvent(event);
  const base = parseBase(event.payload);
  if (!message || !base) {
    return { result: 'dead', error: `unrecognised or malformed ${event.kind}` };
  }
  const { target } = base;

  if (target.type === 'channel') {
    if (!deps.isChannelConfigured(target.channel, target.channelId)) {
      return { result: 'delivered' };
    }
    try {
      await deps.sendChannel(
        target.channel,
        message,
        undefined,
        target.channelId
      );
      return { result: 'delivered' };
    } catch (err) {
      const decision = decideAck({
        failure: classifyDeliveryError(err),
        attempts: event.attempts,
        hasFallback: false,
        message: messageOf(err)
      });
      return { result: decision.result, error: decision.error };
    }
  }

  try {
    const sent = await deps.sendDm(target.discordId, message);
    return typeof sent === 'string'
      ? { result: 'delivered', messageId: sent }
      : { result: 'delivered' };
  } catch (err) {
    const fallbackInfo = event.payload as {
      fallbackChannel?: OutboxChannel;
      fallbackChannelId?: string | null;
    };
    const fallback = fallbackInfo.fallbackChannel;
    const fallbackId = fallbackInfo.fallbackChannelId;
    const hasFallback =
      !!fallback && deps.isChannelConfigured(fallback, fallbackId);
    const decision = decideAck({
      failure: classifyDeliveryError(err),
      attempts: event.attempts,
      hasFallback,
      message: messageOf(err)
    });
    if (decision.useFallback && fallback) {
      try {
        await deps.sendChannel(fallback, message, target.discordId, fallbackId);
        return { result: 'delivered' };
      } catch (fallbackErr) {
        const next = decideAck({
          failure: classifyDeliveryError(fallbackErr),
          attempts: event.attempts,
          hasFallback: false,
          message: messageOf(fallbackErr)
        });
        // A closed DM has no further fallback, so a fallback failure is retried or dropped.
        return {
          result: next.result === 'dead' ? 'dead' : 'retry',
          error: next.error
        };
      }
    }
    return { result: decision.result, error: decision.error };
  }
};
