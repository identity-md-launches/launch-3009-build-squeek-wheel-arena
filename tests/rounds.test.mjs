import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  halfHours,
  ingestCore,
  ingestStatus,
  marketPrices,
  metresFromWork,
  multiplierFor,
  overUnderLine,
  roundAt,
  roundEndMs,
  settleEntry,
  weekStart,
  weeklyStreak,
  workOfRound,
} from '../src/js/rounds.js';

// Values read from /v1/core on 2026-11-05.
const cfg = { genesis: 1793735400, roundSeconds: 600 };

function batch(settled, previous, active, cumulativeWork) {
  return {
    eventName: 'BatchSettled',
    arguments: [
      { name: 'settledThroughRound', value: String(settled) },
      { name: 'previousSettledThroughRound', value: String(previous) },
      { name: 'activeRoundCount', value: String(active) },
      { name: 'cumulativeWork', value: String(cumulativeWork) },
    ],
  };
}

test('round numbering matches the API', () => {
  // Round 283 closed at 2026-11-05T19:00:00Z, and 19:06 is inside round 284.
  assert.equal(roundEndMs(283, cfg), Date.parse('2026-11-05T19:00:00Z'));
  assert.equal(roundAt(Date.parse('2026-11-05T19:06:00Z'), cfg), 284);
  assert.equal(roundAt(Date.parse('2026-11-05T19:00:00Z'), cfg), 284);
});

test('lifetime totals give 878 mm a turn', () => {
  assert.equal(3817 * 878, 3351326);
  assert.equal(metresFromWork(100), 87.8);
});

test('settled batches give per-round work, and unknown stays null', () => {
  const cum = {};
  ingestCore(cum, {
    events: [batch(210, 209, 1, 3817), batch(209, 208, 1, 3638), batch(205, 204, 1, 3488)],
    core: { settledThroughRound: '210', cumulativeWork: '3817' },
  });
  assert.equal(workOfRound(cum, 210), 179);
  assert.equal(workOfRound(cum, 208), null);
  assert.equal(workOfRound(cum, 211), null);
});

test('a batch with no active rounds certifies its span as zero', () => {
  const cum = {};
  ingestCore(cum, { events: [batch(283, 280, 0, 3817)] });
  assert.equal(workOfRound(cum, 283), 0);
  assert.equal(workOfRound(cum, 282), 0);
  assert.equal(workOfRound(cum, 281), 0);
});

test('a batch that hides a per-round split stays unknown', () => {
  const cum = {};
  ingestCore(cum, { events: [batch(300, 298, 1, 4000), batch(298, 297, 1, 3900)] });
  assert.equal(workOfRound(cum, 300), null);
  assert.equal(workOfRound(cum, 299), null);
});

test('an oracle closure resolves a round before it settles on chain', () => {
  const cum = { 283: 3817 };
  ingestStatus(cum, {
    builder: {
      status: 'available',
      anchor: { settledThroughRound: '283', cumulativeWork: '3817' },
      queued: { closedRoundCount: '1', closedWorkUnits: '150', openRoundWorkUnits: '3' },
    },
    oracle: { state: 'accepted', latestClosure: { lastRound: '284' } },
  });
  assert.equal(workOfRound(cum, 284), 150);
});

test('a queue that does not span the closure is ignored', () => {
  const cum = { 283: 3817 };
  ingestStatus(cum, {
    builder: {
      status: 'available',
      anchor: { settledThroughRound: '283', cumulativeWork: '3817' },
      queued: { closedRoundCount: '0', closedWorkUnits: '0' },
    },
    oracle: { state: 'accepted', latestClosure: { lastRound: '284' } },
  });
  assert.equal(workOfRound(cum, 284), null);
});

test('an unavailable builder reports nothing', () => {
  const cum = {};
  ingestStatus(cum, { builder: { status: 'unavailable' } });
  assert.deepEqual(cum, {});
});

test('bets settle on the reported work', () => {
  const bet = { stake: 100, mult: 2.4 };
  assert.deepEqual(settleEntry({ ...bet, kind: 'sprint' }, 5).status, 'won');
  assert.deepEqual(settleEntry({ ...bet, kind: 'rest' }, 5).payout, 0);
  assert.equal(settleEntry({ ...bet, kind: 'rest' }, 0).payout, 240);
  assert.equal(settleEntry({ ...bet, kind: 'over', line: 100 }, 200).status, 'won');
  assert.equal(settleEntry({ ...bet, kind: 'over', line: 100 }, 100).status, 'lost');
  assert.equal(settleEntry({ ...bet, kind: 'under', line: 100 }, 100).status, 'won');
});

test('a tie on the line returns the stake', () => {
  // 500 turns is exactly 439 m.
  const outcome = settleEntry({ kind: 'over', stake: 100, mult: 2, line: 439 }, 500);
  assert.equal(outcome.status, 'push');
  assert.equal(outcome.payout, 100);
});

test('races compare your metres with his round', () => {
  const entry = { kind: 'race', metres: 120 };
  assert.deepEqual(settleEntry(entry, 100), { status: 'won', payout: 220, metres: 87.8 });
  assert.equal(settleEntry(entry, 200).status, 'lost');
  assert.equal(settleEntry(entry, 200).payout, 60);
  assert.equal(settleEntry(entry, 0).status, 'rest');
  assert.equal(settleEntry(entry, 0).payout, 60);
  assert.equal(settleEntry({ kind: 'race', metres: 5000 }, 1).payout, 400);
});

test('the line comes from real form and is absent without it', () => {
  assert.equal(overUnderLine('150', []), 130);
  assert.equal(overUnderLine(undefined, [{ work: 0 }, { work: 200 }]), 180);
  assert.equal(overUnderLine(undefined, [{ work: 0 }]), null);
  assert.equal(overUnderLine('0', []), null);
});

test('pays follow how often an outcome happened', () => {
  assert.equal(multiplierFor(0, 24), 8);
  assert.equal(multiplierFor(24, 24), 1.1);
  const rows = [{ work: 0 }, { work: 0 }, { work: 0 }, { work: 200 }, { work: null }];
  const prices = marketPrices(rows, 100);
  assert.equal(prices.sample, 4);
  assert.equal(prices.active, 1);
  assert.ok(prices.sprint > prices.rest);
  assert.ok(prices.over > prices.under);
});

test('half-hour cells run noon to noon UTC', () => {
  const cells = halfHours({
    activity: {
      days: [
        {
          date: '2026-11-04',
          buckets: [
            { startMinuteUtc: 270, coverage: 'complete', workUnits: '1130' },
            { startMinuteUtc: 720, coverage: 'complete', workUnits: '0' },
            { startMinuteUtc: 1410, coverage: 'future', workUnits: null },
          ],
        },
      ],
    },
  });
  assert.equal(cells.length, 2);
  assert.equal(cells[0].at, Date.parse('2026-11-04T12:00:00Z'));
  // The API's own record places this peak at 2026-11-05T04:30.
  assert.equal(cells[1].at, Date.parse('2026-11-05T04:30:00Z'));
  assert.equal(cells[1].work, 1130);
});

test('weekly streaks count back from this week or the last', () => {
  const now = Date.parse('2026-11-05T19:00:00Z');
  const thisWeek = weekStart(now);
  const week = 7 * 24 * 60 * 60 * 1000;
  assert.equal(new Date(thisWeek).getUTCDay(), 1);
  assert.equal(weeklyStreak({}, now), 0);
  assert.equal(weeklyStreak({ [thisWeek]: 1, [thisWeek - week]: 2 }, now), 2);
  assert.equal(weeklyStreak({ [thisWeek - week]: 1 }, now), 1);
  assert.equal(weeklyStreak({ [thisWeek - 2 * week]: 1 }, now), 0);
});
