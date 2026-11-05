// Points, entries and the leaderboard live in this browser's localStorage. A static site
// has no server to share them, and the board says so where it is shown.
import { STARTING_POINTS, settleEntry, weekStart, weeklyStreak } from './rounds.js';

const KEY = 'swa.state.v1';
const CODE_PREFIX = 'SWA1';
const KEEP_SETTLED = 100;

const listeners = new Set();
let memory = null;
let storageWorks = true;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const newId = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function newPlayer(name) {
  return {
    id: newId(),
    name,
    points: STARTING_POINTS,
    wins: 0,
    weeks: {},
    entries: [],
  };
}

function fresh() {
  const player = newPlayer('Player 1');
  return { activeId: player.id, players: { [player.id]: player }, imported: [] };
}

function read() {
  if (!storageWorks && memory) return memory;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (parsed?.players?.[parsed.activeId]) return parsed;
  } catch {
    storageWorks = false;
  }
  memory = memory ?? fresh();
  return memory;
}

function mutate(fn) {
  const state = read();
  const result = fn(state);
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
  listeners.forEach((listener) => listener());
  return result;
}

window.addEventListener('storage', (event) => {
  if (event.key === KEY) listeners.forEach((listener) => listener());
});

export const storageAvailable = () => storageWorks;
export const player = () => {
  const state = read();
  return state.players[state.activeId];
};
export const players = () => Object.values(read().players);

export function renamePlayer(name) {
  mutate((state) => {
    state.players[state.activeId].name = name;
  });
}

export function addPlayer(name) {
  mutate((state) => {
    const next = newPlayer(name);
    state.players[next.id] = next;
    state.activeId = next.id;
  });
}

export function switchPlayer(id) {
  mutate((state) => {
    if (state.players[id]) state.activeId = id;
  });
}

export function placeBet({ kind, round, stake, mult, line = null }) {
  return mutate((state) => {
    const me = state.players[state.activeId];
    if (me.points < stake) return false;
    me.points -= stake;
    me.entries.push({
      id: newId(),
      kind,
      round,
      stake,
      mult,
      line,
      status: 'pending',
      placedAt: Date.now(),
    });
    return true;
  });
}

// Adds metres run during `round` to this player's one race entry for that round.
export function bankRace(round, metres, { finishedRun = false, runMetres = 0 } = {}) {
  if (metres <= 0 && !finishedRun) return;
  mutate((state) => {
    const me = state.players[state.activeId];
    let entry = me.entries.find(
      (item) => item.kind === 'race' && item.round === round && item.status === 'pending',
    );
    if (!entry) {
      entry = { id: newId(), kind: 'race', round, metres: 0, runs: 0, best: 0, status: 'pending', placedAt: Date.now() };
      me.entries.push(entry);
    }
    entry.metres += metres;
    if (finishedRun) {
      entry.runs += 1;
      entry.best = Math.max(entry.best, runMetres);
    }
  });
}

// `resolve(entry)` gives { work }, { void: true } or null while the round is not reported.
// Returns the outcomes this call settled for the active player.
export function settlePending(resolve, roundEnd) {
  const pendingExists = players().some((p) => p.entries.some((e) => e.status === 'pending'));
  if (!pendingExists) return [];
  let hasWork = false;
  const state = read();
  for (const p of Object.values(state.players)) {
    if (p.entries.some((e) => e.status === 'pending' && resolve(e))) hasWork = true;
  }
  if (!hasWork) return [];
  return mutate((next) => {
    const settled = [];
    for (const p of Object.values(next.players)) {
      for (const entry of p.entries) {
        if (entry.status !== 'pending') continue;
        const answer = resolve(entry);
        if (!answer) continue;
        if (answer.void) {
          entry.status = 'void';
          entry.payout = entry.kind === 'race' ? 0 : entry.stake;
        } else {
          const outcome = settleEntry(entry, answer.work);
          entry.status = outcome.status;
          entry.payout = outcome.payout;
          entry.result = outcome.metres;
          if (outcome.status === 'won') {
            const week = weekStart(roundEnd(entry.round));
            p.weeks[week] = (p.weeks[week] ?? 0) + 1;
            p.wins += 1;
          }
        }
        p.points += entry.payout;
        if (p.id === next.activeId) settled.push({ ...entry });
      }
      const done = p.entries.filter((e) => e.status !== 'pending');
      const stale = new Set(done.slice(0, Math.max(0, done.length - KEEP_SETTLED)));
      p.entries = p.entries.filter((e) => !stale.has(e));
    }
    return settled;
  });
}

export function streakOf(p, now) {
  return weeklyStreak(p.weeks, now);
}

// Best run of consecutive winning weeks, so an earned badge stays earned.
export function bestStreakOf(p) {
  const weeks = Object.keys(p.weeks).map(Number).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = null;
  for (const week of weeks) {
    run = previous !== null && week - previous === 7 * 24 * 60 * 60 * 1000 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = week;
  }
  return best;
}

function checksum(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) % 2147483647;
  return hash.toString(36);
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

export function makeScoreCode(p, now) {
  const body = toBase64Url(
    JSON.stringify({ id: p.id, n: p.name, p: p.points, w: p.wins, s: streakOf(p, now), at: now }),
  );
  return `${CODE_PREFIX}.${body}.${checksum(body)}`;
}

// Returns an error sentence, or null when the code was added.
export function importScoreCode(code) {
  const [prefix, body, sum] = code.trim().split('.');
  if (prefix !== CODE_PREFIX || !body || checksum(body) !== sum) {
    return 'Paste the whole score code, starting with SWA1.';
  }
  let card;
  try {
    card = JSON.parse(fromBase64Url(body));
  } catch {
    return 'Paste the whole score code, starting with SWA1.';
  }
  if (typeof card.n !== 'string' || !Number.isFinite(card.p) || !Number.isFinite(card.at)) {
    return 'Paste the whole score code, starting with SWA1.';
  }
  if (read().players[card.id]) return 'This code belongs to a player on this browser, who is already on the board.';
  mutate((state) => {
    state.imported = state.imported.filter((row) => row.id !== card.id);
    state.imported.push({
      id: String(card.id),
      name: card.n.slice(0, 24),
      points: Math.round(card.p),
      wins: Number(card.w) || 0,
      streak: Number(card.s) || 0,
      at: card.at,
    });
  });
  return null;
}

export function removeImported(id) {
  mutate((state) => {
    state.imported = state.imported.filter((row) => row.id !== id);
  });
}

export function leaderboard(now) {
  const state = read();
  const rows = Object.values(state.players).map((p) => ({
    id: p.id,
    name: p.name,
    points: p.points,
    wins: p.wins,
    streak: streakOf(p, now),
    source: p.id === state.activeId ? 'Playing now' : 'This browser',
    imported: false,
    active: p.id === state.activeId,
  }));
  for (const row of state.imported) rows.push({ ...row, source: 'Score code', imported: true, active: false });
  return rows.sort((a, b) => b.points - a.points);
}
