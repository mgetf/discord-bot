/**
 * Contract with the mge.tf site. Mirrors
 * website-next/src/lib/server/utils/outboxEvents.ts — change them together.
 */

export type OutboxChannel = 'staff' | 'playoffs';

export type OutboxTarget =
  | { type: 'dm'; discordId: string; steamId: string }
  | {
      type: 'channel';
      channel: OutboxChannel;
      /** The region's own channel; absent means use the bot's default for `channel`. */
      channelId?: string | null;
    };

export type OutboxTeamRef = { id: number; name: string };

type Base = {
  target: OutboxTarget;
  fallbackChannel?: OutboxChannel;
  /** The region's own channel for `fallbackChannel`, when it has one. */
  fallbackChannelId?: string | null;
  url: string;
  division: string;
};

type MatchFields = {
  round: string | null;
  home: OutboxTeamRef;
  away: OutboxTeamRef;
};

export type MatchCreatedPayload = Base &
  MatchFields & {
    bestOf: number;
    arenaGames: number;
    recipientSide: 'home' | 'away' | null;
  };

export type ScoreSubmittedPayload = Base &
  MatchFields & {
    submittedByTeam: string;
    winnerName: string;
    score: string;
    autoConfirmAt: string;
  };

export type ScoreConfirmedPayload = Base &
  MatchFields & {
    winnerName: string;
    loserName: string;
    score: string;
    auto: boolean;
  };

export type ScoreDisputedPayload = Base &
  MatchFields & {
    disputedByTeam: string;
    reason: string | null;
  };

export type TeamEliminatedPayload = Base & {
  teamName: string;
  eliminatedBy: string;
};

export type BracketCompletePayload = Base & {
  podium: Array<{ place: number; name: string }>;
};

export type OutboxPayloadByKind = {
  'playoff.match_created': MatchCreatedPayload;
  'playoff.score_submitted': ScoreSubmittedPayload;
  'playoff.score_confirmed': ScoreConfirmedPayload;
  'playoff.score_disputed': ScoreDisputedPayload;
  'playoff.team_eliminated': TeamEliminatedPayload;
  'playoff.bracket_complete': BracketCompletePayload;
};

export type OutboxKind = keyof OutboxPayloadByKind;

export type OutboxAckResult = 'delivered' | 'retry' | 'dead';

export type ClaimedOutboxEvent = {
  id: number;
  kind: string;
  attempts: number;
  payload: unknown;
};

export const OUTBOX_KINDS: readonly OutboxKind[] = [
  'playoff.match_created',
  'playoff.score_submitted',
  'playoff.score_confirmed',
  'playoff.score_disputed',
  'playoff.team_eliminated',
  'playoff.bracket_complete'
];

export const isOutboxKind = (kind: string): kind is OutboxKind =>
  (OUTBOX_KINDS as readonly string[]).includes(kind);
