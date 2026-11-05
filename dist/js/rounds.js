// Pure round, market and settlement rules. No DOM and no network, so `node --test` can run them.

// One work unit is one accepted wheel turn. /v1/measurement/stats reports lifetime
// observedDistanceMm 3351326 for acceptedWorkUnits 3817, which is exactly 878 mm per unit.
export const MM_PER_WORK = 878;

export const RACE_BASE_CAP = 300;
export const RACE_WIN_BONUS = 100;
export const STARTING_POINTS = 500;
export const STAKES = [50, 100, 200];
const MIN_MULT = 1.1;
const MAX_MULT = 8;
const HOUSE_EDGE = 0.95;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const metresFromWork = (work) => (work * MM_PER_WORK) / 1000;

// Round 1 begins at genesis and each round lasts roundSeconds.
export const roundAt = (ms, cfg) => Math.floor((ms / 1000 - cfg.genesis) / cfg.roundSeconds) + 1;
export const roundStartMs = (n, cfg) => (cfg.genesis + (n - 1) * cfg.roundSeconds) * 1000;
export const roundEndMs = (n, cfg) => (cfg.genesis + n * cfg.roundSeconds) * 1000;

export function configFromCore(core) {
  const genesis = Number(core?.configuration?.genesisTimestamp);
  const roundSeconds = Number(core?.configuration?.roundDuration);
  if (!Number.isFinite(genesis) || !Number.isFinite(roundSeconds) || roundSeconds <= 0) return null;
  return { genesis, roundSeconds };
}

// `cum` maps a round number to cumulative accepted work through the end of that round.
// A missing round is unknown, never zero, as the Squeekchain docs require.

export function ingestStatus(cum, status) {
  let changed = false;
  const set = (round, value) => {
    if (!Number.isFinite(round) || !Number.isFinite(value)) return;
    if (cum[round] !== value) {
      cum[round] = value;
      changed = true;
    }
  };
  const builder = status?.builder;
  const anchor = builder?.anchor;
  if (builder?.status !== 'available' || !anchor) return changed;
  const settled = Number(anchor.settledThroughRound);
  const settledWork = Number(anchor.cumulativeWork);
  set(settled, settledWork);
  // Rounds the oracle closed but the chain has not settled yet. The count check keeps
  // this from running on a queue that does not span exactly settled+1 through lastRound.
  const closure = status?.oracle?.latestClosure;
  const queued = builder.queued;
  if (closure && queued && status.oracle.state === 'accepted') {
    const last = Number(closure.lastRound);
    if (last > settled && Number(queued.closedRoundCount) === last - settled) {
      set(last, settledWork + Number(queued.closedWorkUnits));
    }
  }
  return changed;
}

export function ingestCore(cum, core) {
  for (const event of core?.events ?? []) {
    if (event.eventName !== 'BatchSettled') continue;
    const args = {};
    for (const arg of event.arguments ?? []) args[arg.name] = arg.value;
    const settled = Number(args.settledThroughRound);
    const previous = Number(args.previousSettledThroughRound);
    const work = Number(args.cumulativeWork);
    if (!Number.isFinite(settled) || !Number.isFinite(work)) continue;
    cum[settled] = work;
    // A batch with no active rounds certifies its whole span as zero work.
    if (Number(args.activeRoundCount) === 0 && Number.isFinite(previous)) cum[previous] = work;
  }
  const settled = Number(core?.core?.settledThroughRound);
  const work = Number(core?.core?.cumulativeWork);
  if (Number.isFinite(settled) && Number.isFinite(work)) cum[settled] = work;
}

// Cumulative work never falls, so equal neighbours fix every round between them.
function cumulativeAt(cum, n) {
  if (cum[n] !== undefined) return cum[n];
  let below = null;
  let above = null;
  for (const key of Object.keys(cum)) {
    const round = Number(key);
    if (round < n && (below === null || round > below)) below = round;
    if (round > n && (above === null || round < above)) above = round;
  }
  if (below === null || above === null) return null;
  return cum[below] === cum[above] ? cum[below] : null;
}

// Work the API reports for a closed round, or null while it is not known.
export function workOfRound(cum, n) {
  const high = cumulativeAt(cum, n);
  const low = cumulativeAt(cum, n - 1);
  if (high === null || low === null) return null;
  return high - low;
}

export function trimCum(cum, keep = 400) {
  const rounds = Object.keys(cum).map(Number).sort((a, b) => a - b);
  for (const round of rounds.slice(0, Math.max(0, rounds.length - keep))) delete cum[round];
}

// Most recent closed rounds, newest last. `work` stays null where the API has not reported.
export function recentRounds(cum, latestClosed, count) {
  const rows = [];
  for (let n = latestClosed - count + 1; n <= latestClosed; n += 1) {
    if (n < 1) continue;
    rows.push({ round: n, work: workOfRound(cum, n) });
  }
  return rows;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

// The line comes from real form: the 7-day median active round, else the recent median.
export function overUnderLine(medianActiveWork, rows) {
  let work = Number(medianActiveWork);
  if (!Number.isFinite(work) || work <= 0) {
    work = median(rows.filter((row) => row.work > 0).map((row) => row.work));
  }
  if (work === null || !(work > 0)) return null;
  return Math.max(10, Math.round(metresFromWork(work) / 10) * 10);
}

// Pays against how often the outcome really happened in recent rounds, shown before the bet.
export function multiplierFor(hits, total) {
  const chance = (hits + 1) / (total + 2);
  const raw = HOUSE_EDGE / chance;
  return Math.round(Math.min(MAX_MULT, Math.max(MIN_MULT, raw)) * 10) / 10;
}

export function marketPrices(rows, line) {
  const known = rows.filter((row) => row.work !== null);
  const total = known.length;
  const active = known.filter((row) => row.work > 0).length;
  const prices = {
    sprint: multiplierFor(active, total),
    rest: multiplierFor(total - active, total),
    sample: total,
    active,
  };
  if (line !== null) {
    const over = known.filter((row) => row.work * MM_PER_WORK > line * 1000).length;
    const under = known.filter((row) => row.work * MM_PER_WORK < line * 1000).length;
    prices.over = multiplierFor(over, total);
    prices.under = multiplierFor(under, total);
  }
  return prices;
}

// Compares in whole millimetres so a tie on the line is exact.
export function settleEntry(entry, work) {
  const metres = metresFromWork(work);
  if (entry.kind === 'race') {
    const base = Math.min(Math.round(entry.metres), RACE_BASE_CAP);
    if (work === 0) return { status: 'rest', payout: Math.floor(base / 2), metres };
    if (entry.metres > metres) return { status: 'won', payout: base + RACE_WIN_BONUS, metres };
    return { status: 'lost', payout: Math.floor(base / 2), metres };
  }
  let won;
  if (entry.kind === 'over' || entry.kind === 'under') {
    const mm = work * MM_PER_WORK;
    const lineMm = entry.line * 1000;
    if (mm === lineMm) return { status: 'push', payout: entry.stake, metres };
    won = entry.kind === 'over' ? mm > lineMm : mm < lineMm;
  } else {
    won = entry.kind === 'sprint' ? work > 0 : work === 0;
  }
  if (won) return { status: 'won', payout: Math.round(entry.stake * entry.mult), metres };
  return { status: 'lost', payout: 0, metres };
}

// Half-hour activity, oldest first. API days run noon to noon UTC, so a bucket's minute
// below 720 belongs to the next calendar day.
export function halfHours(stats, count = 48) {
  const cells = [];
  for (const day of stats?.activity?.days ?? []) {
    const noon = Date.parse(`${day.date}T12:00:00Z`);
    for (const bucket of day.buckets ?? []) {
      if (bucket.coverage === 'future') continue;
      const minute = bucket.startMinuteUtc;
      const offset = minute >= 720 ? minute - 720 : minute + 720;
      cells.push({
        at: noon + offset * 60000,
        work: bucket.workUnits === null ? null : Number(bucket.workUnits),
      });
    }
  }
  cells.sort((a, b) => a.at - b.at);
  return cells.slice(-count);
}

// Weeks start on Monday, UTC.
export function weekStart(ms) {
  const date = new Date(ms);
  const fromMonday = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - fromMonday);
}

// Consecutive weeks with a win. The current week still counts as open until it ends.
export function weeklyStreak(weeks, now) {
  let week = weekStart(now);
  if (!weeks[week]) week -= WEEK_MS;
  let streak = 0;
  while (weeks[week]) {
    streak += 1;
    week -= WEEK_MS;
  }
  return streak;
}

export const BADGES = [
  { weeks: 1, name: 'First lap' },
  { weeks: 2, name: 'Two-week wheel' },
  { weeks: 4, name: 'Four-week wheel' },
  { weeks: 8, name: 'Eight-week wheel' },
  { weeks: 12, name: 'Twelve-week wheel' },
];
