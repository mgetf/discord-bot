import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import type {
  BracketCompletePayload,
  ClaimedOutboxEvent,
  MatchCreatedPayload,
  OutboxKind,
  OutboxPayloadByKind,
  OutboxTarget,
  ScoreConfirmedPayload,
  ScoreDisputedPayload,
  ScoreSubmittedPayload,
  TeamEliminatedPayload
} from '@/outbox/types';
import { isOutboxKind } from '@/outbox/types';

const Colors = {
  Info: 0x5865f2,
  Success: 0x57f287,
  Warning: 0xfee75c,
  Danger: 0xed4245,
  Gold: 0xf1c40f
} as const;

export type OutboxMessage = {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

const linkRow = (label: string, url: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url)
  );

const context = (division: string, round: string | null) =>
  round ? `${division} · ${round}` : division;

const isDm = (target: OutboxTarget) => target.type === 'dm';

const discordTime = (iso: string): string => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'soon';
  return `<t:${Math.floor(ms / 1000)}:R>`;
};

export const renderMatchCreated = (p: MatchCreatedPayload): OutboxMessage => {
  const opponent =
    p.recipientSide === 'home'
      ? p.away.name
      : p.recipientSide === 'away'
        ? p.home.name
        : null;
  const series = `Best of ${p.bestOf}, ${p.arenaGames} per arena`;
  const embed = new EmbedBuilder()
    .setColor(Colors.Info)
    .setFooter({ text: context(p.division, p.round) });

  if (isDm(p.target) && opponent) {
    embed
      .setTitle('Your next playoff match is ready')
      .setDescription(
        `You play **${opponent}**.\n${series}. Get in touch and schedule it on the match page.`
      );
  } else {
    embed
      .setTitle('New playoff match')
      .setDescription(`**${p.home.name}** vs **${p.away.name}**\n${series}.`);
  }
  return { embeds: [embed], components: [linkRow('Open match', p.url)] };
};

export const renderScoreSubmitted = (
  p: ScoreSubmittedPayload
): OutboxMessage => {
  const embed = new EmbedBuilder()
    .setColor(Colors.Warning)
    .setTitle('Please confirm a score')
    .setDescription(
      `**${p.submittedByTeam}** reported **${p.winnerName}** winning **${p.score}** (${p.home.name} vs ${p.away.name}).\n` +
        `Confirm or dispute ${discordTime(p.autoConfirmAt)}, or it confirms automatically.`
    )
    .setFooter({ text: context(p.division, p.round) });
  return { embeds: [embed], components: [linkRow('Review score', p.url)] };
};

export const renderScoreConfirmed = (
  p: ScoreConfirmedPayload
): OutboxMessage => {
  const how = p.auto
    ? 'The report was confirmed automatically because nobody answered in time.'
    : 'Both teams confirmed the result.';
  const embed = new EmbedBuilder()
    .setColor(Colors.Success)
    .setTitle(isDm(p.target) ? 'Score confirmed' : `${p.winnerName} advances`)
    .setDescription(
      `**${p.winnerName}** beat **${p.loserName}** **${p.score}**.\n${how}`
    )
    .setFooter({ text: context(p.division, p.round) });
  return { embeds: [embed], components: [linkRow('Open match', p.url)] };
};

export const renderScoreDisputed = (p: ScoreDisputedPayload): OutboxMessage => {
  const staff = p.target.type === 'channel';
  const reason = p.reason ? `\nReason: ${p.reason.slice(0, 500)}` : '';
  const embed = new EmbedBuilder()
    .setColor(Colors.Danger)
    .setTitle(staff ? 'Playoff score disputed' : 'Your score was disputed')
    .setDescription(
      `**${p.disputedByTeam}** disputed the reported score for **${p.home.name}** vs **${p.away.name}**.${reason}\n` +
        (staff
          ? 'A staff member needs to resolve it.'
          : 'Staff will review it. The bracket waits until it is resolved.')
    )
    .setFooter({ text: context(p.division, p.round) });
  return { embeds: [embed], components: [linkRow('Open match', p.url)] };
};

export const renderTeamEliminated = (
  p: TeamEliminatedPayload
): OutboxMessage => {
  const embed = new EmbedBuilder()
    .setColor(Colors.Danger)
    .setTitle(
      isDm(p.target)
        ? 'You are out of the playoffs'
        : `${p.teamName} eliminated`
    )
    .setDescription(
      isDm(p.target)
        ? `**${p.teamName}** was eliminated by **${p.eliminatedBy}**. Thanks for playing!`
        : `**${p.teamName}** was eliminated by **${p.eliminatedBy}**.`
    )
    .setFooter({ text: p.division });
  return { embeds: [embed], components: [linkRow('View bracket', p.url)] };
};

const PLACE_LABEL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export const renderBracketComplete = (
  p: BracketCompletePayload
): OutboxMessage => {
  const podium = [...p.podium]
    .sort((a, b) => a.place - b.place)
    .map(
      (row) => `${PLACE_LABEL[row.place] ?? `#${row.place}`} **${row.name}**`
    )
    .join('\n');
  const embed = new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle(`${p.division} playoffs are over`)
    .setDescription(podium || 'The bracket is complete.');
  return { embeds: [embed], components: [linkRow('View bracket', p.url)] };
};

const renderers: {
  [K in OutboxKind]: (payload: OutboxPayloadByKind[K]) => OutboxMessage;
} = {
  'playoff.match_created': renderMatchCreated,
  'playoff.score_submitted': renderScoreSubmitted,
  'playoff.score_confirmed': renderScoreConfirmed,
  'playoff.score_disputed': renderScoreDisputed,
  'playoff.team_eliminated': renderTeamEliminated,
  'playoff.bracket_complete': renderBracketComplete
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isTarget = (t: unknown): t is OutboxTarget => {
  if (!isObject(t)) return false;
  if (t.type === 'dm') {
    return typeof t.discordId === 'string' && t.discordId.length > 0;
  }
  return (
    t.type === 'channel' && (t.channel === 'staff' || t.channel === 'playoffs')
  );
};

/** Shape check for the fields every payload shares. Returns null when it is malformed. */
export const parseBase = (
  payload: unknown
): { target: OutboxTarget; url: string } | null => {
  if (!isObject(payload)) return null;
  if (!isTarget(payload.target)) return null;
  if (typeof payload.url !== 'string' || !payload.url.startsWith('http')) {
    return null;
  }
  if (typeof payload.division !== 'string') return null;
  return { target: payload.target, url: payload.url };
};

/**
 * Renders one claimed event. Returns null for an unknown kind or a payload
 * that is not shaped like its kind needs, which the worker treats as dead.
 */
export const renderOutboxEvent = (
  event: Pick<ClaimedOutboxEvent, 'kind' | 'payload'>
): OutboxMessage | null => {
  if (!isOutboxKind(event.kind)) return null;
  if (!parseBase(event.payload)) return null;
  try {
    const render = renderers[event.kind] as (p: unknown) => OutboxMessage;
    return render(event.payload);
  } catch {
    return null;
  }
};
