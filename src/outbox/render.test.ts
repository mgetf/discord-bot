import { describe, expect, test } from 'bun:test';
import { renderOutboxEvent } from '@/outbox/render';

const teams = {
  home: { id: 1, name: 'Alpha' },
  away: { id: 2, name: 'Bravo' }
};
const base = {
  url: 'https://mge.tf/matches/9',
  division: 'Premier',
  round: 'Semifinals',
  ...teams
};
const dm = { type: 'dm', discordId: '111', steamId: '765' } as const;
const staff = { type: 'channel', channel: 'staff' } as const;

const json = (m: ReturnType<typeof renderOutboxEvent>) => {
  if (!m) throw new Error('expected a rendered message');
  return { embed: m.embeds[0]?.toJSON(), row: m.components[0]?.toJSON() };
};

describe('renderOutboxEvent', () => {
  test('match.reminder tells each side who they play and when', () => {
    const startsAt = '2026-11-21T20:00:00.000Z';
    const seconds = Math.floor(Date.parse(startsAt) / 1000);
    const away = json(
      renderOutboxEvent({
        kind: 'match.reminder',
        payload: {
          ...base,
          target: dm,
          startsAt,
          stage: '1h',
          recipientSide: 'away'
        }
      })
    );
    expect(away.embed?.title).toBe('Your match starts soon');
    expect(away.embed?.description).toContain('**Alpha**');
    expect(away.embed?.description).toContain(`<t:${seconds}:R>`);

    const day = json(
      renderOutboxEvent({
        kind: 'match.reminder',
        payload: {
          ...base,
          target: dm,
          startsAt,
          stage: '24h',
          recipientSide: 'home'
        }
      })
    );
    expect(day.embed?.title).toBe('Upcoming match');
    expect(day.embed?.description).toContain('**Bravo**');
  });

  test('match_created names the opponent for the recipient side', () => {
    const m = renderOutboxEvent({
      kind: 'playoff.match_created',
      payload: {
        ...base,
        target: dm,
        bestOf: 3,
        arenaGames: 3,
        recipientSide: 'home'
      }
    });
    const { embed, row } = json(m);
    expect(embed?.description).toContain('**Bravo**');
    expect(embed?.description).toContain(
      'Best of 3 arenas, first to 2 rounds (bo3)'
    );
    expect(embed?.footer?.text).toBe('Premier · Semifinals');
    expect(row?.components[0]).toMatchObject({
      label: 'Open match',
      url: 'https://mge.tf/matches/9'
    });
  });

  test('match_created channel post shows both teams', () => {
    const m = renderOutboxEvent({
      kind: 'playoff.match_created',
      payload: {
        ...base,
        target: { type: 'channel', channel: 'playoffs' },
        bestOf: 5,
        arenaGames: 3,
        recipientSide: null
      }
    });
    expect(json(m).embed?.description).toContain('**Alpha** vs **Bravo**');
  });

  test('score_submitted uses a relative discord timestamp', () => {
    const m = renderOutboxEvent({
      kind: 'playoff.score_submitted',
      payload: {
        ...base,
        target: dm,
        submittedByTeam: 'Alpha',
        winnerName: 'Alpha',
        score: '2-1',
        autoConfirmAt: '2026-11-21T00:00:00.000Z'
      }
    });
    const { embed, row } = json(m);
    expect(embed?.description).toContain('2-1');
    expect(embed?.description).toContain('<t:1795219200:R>');
    expect(row?.components[0]).toMatchObject({ label: 'Review score' });
  });

  test('score_confirmed mentions auto confirmation', () => {
    const m = renderOutboxEvent({
      kind: 'playoff.score_confirmed',
      payload: {
        ...base,
        target: dm,
        winnerName: 'Alpha',
        loserName: 'Bravo',
        score: '2-0',
        auto: true
      }
    });
    expect(json(m).embed?.description).toContain('automatically');
  });

  test('score_disputed words staff and team posts differently', () => {
    const payload = {
      ...base,
      disputedByTeam: 'Bravo',
      reason: 'Wrong arena'
    };
    const staffMsg = renderOutboxEvent({
      kind: 'playoff.score_disputed',
      payload: { ...payload, target: staff }
    });
    const dmMsg = renderOutboxEvent({
      kind: 'playoff.score_disputed',
      payload: { ...payload, target: dm }
    });
    expect(json(staffMsg).embed?.title).toBe('Playoff score disputed');
    expect(json(dmMsg).embed?.title).toBe('Your score was disputed');
    expect(json(staffMsg).embed?.description).toContain('Wrong arena');
  });

  test('team_eliminated and bracket_complete render', () => {
    const out = renderOutboxEvent({
      kind: 'playoff.team_eliminated',
      payload: {
        target: dm,
        url: base.url,
        division: 'Premier',
        teamName: 'Bravo',
        eliminatedBy: 'Alpha'
      }
    });
    expect(json(out).embed?.title).toBe('You are out of the playoffs');

    const done = renderOutboxEvent({
      kind: 'playoff.bracket_complete',
      payload: {
        target: staff,
        url: base.url,
        division: 'Premier',
        podium: [
          { place: 2, name: 'Bravo' },
          { place: 1, name: 'Alpha' }
        ]
      }
    });
    const desc = json(done).embed?.description ?? '';
    expect(desc.indexOf('Alpha')).toBeLessThan(desc.indexOf('Bravo'));
  });

  test('unknown kinds and malformed payloads return null', () => {
    expect(renderOutboxEvent({ kind: 'nope', payload: {} })).toBeNull();
    expect(
      renderOutboxEvent({ kind: 'playoff.match_created', payload: null })
    ).toBeNull();
    expect(
      renderOutboxEvent({
        kind: 'playoff.match_created',
        payload: { target: dm, url: base.url, division: 'P' }
      })
    ).toBeNull();
    expect(
      renderOutboxEvent({
        kind: 'playoff.team_eliminated',
        payload: { target: dm, url: 'javascript:x', division: 'P' }
      })
    ).toBeNull();
  });
});
