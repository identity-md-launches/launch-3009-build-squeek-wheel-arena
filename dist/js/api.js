// Live reads from Squeekchain's public API. Browsers may call it directly (CORS is *),
// and it needs no key. Unknown stays unknown: nothing here turns a failure into a zero.
import {
  configFromCore,
  halfHours,
  ingestCore,
  ingestStatus,
  recentRounds,
  roundAt,
  trimCum,
} from './rounds.js';

const BASE = 'https://api.squeekchain.com/v1';
const CUM_KEY = 'swa.cum.v1';
const CORE_EVERY_MS = 60_000;
const STATS_EVERY_MS = 60 * 60_000;

export const live = {
  phase: 'loading', // loading | ok | error
  status: null,
  cfg: null,
  cum: readCum(),
  coreSettled: null,
  stats: null,
  statsFailed: false,
  clockOffset: 0,
  retryAt: 0,
};

const listeners = new Set();
let pollMs = 5000;
let pollTimer = null;
let coreAt = 0;
let statsAt = 0;

export function onLive(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

function readCum() {
  try {
    return JSON.parse(localStorage.getItem(CUM_KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeCum() {
  try {
    trimCum(live.cum);
    localStorage.setItem(CUM_KEY, JSON.stringify(live.cum));
  } catch {
    // Without storage the map still lives for this visit.
  }
}

class RetryLater extends Error {
  constructor(seconds) {
    super('rate limited');
    this.seconds = seconds;
  }
}

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${BASE}${path}`, { signal: controller.signal });
    if (response.status === 429) {
      throw new RetryLater(Number(response.headers.get('Retry-After')) || 10);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function readStatus() {
  const status = await getJson('/status');
  live.status = status;
  const generated = Date.parse(status.generatedAt);
  if (Number.isFinite(generated)) {
    const offset = generated - Date.now();
    if (Math.abs(offset - live.clockOffset) > 2000) live.clockOffset = offset;
  }
  if (ingestStatus(live.cum, status)) writeCum();
  live.phase = 'ok';
}

async function readCore() {
  const core = await getJson('/core');
  live.cfg = configFromCore(core) ?? live.cfg;
  ingestCore(live.cum, core);
  const settled = Number(core?.core?.settledThroughRound);
  if (Number.isFinite(settled)) live.coreSettled = settled;
  writeCum();
  coreAt = Date.now();
}

async function readStats() {
  statsAt = Date.now();
  try {
    live.stats = await getJson('/measurement/stats?range=7d');
    live.statsFailed = false;
  } catch {
    live.statsFailed = true;
  }
  emit();
}

async function tick() {
  clearTimeout(pollTimer);
  let wait = pollMs;
  try {
    await readStatus();
    if (Date.now() - coreAt > CORE_EVERY_MS) {
      // A failed core read retries on the next tick and leaves a good wheel reading alone.
      await readCore().catch(() => {
        if (!live.cfg) live.phase = 'error';
      });
    }
  } catch (error) {
    if (error instanceof RetryLater) {
      wait = error.seconds * 1000;
    } else {
      live.phase = 'error';
      wait = Math.max(pollMs, 10_000);
    }
    live.retryAt = Date.now() + wait;
  }
  emit();
  if (Date.now() - statsAt > STATS_EVERY_MS) readStats();
  // Two ticks can overlap after a resume or a faster interval; only one timer survives.
  clearTimeout(pollTimer);
  if (!document.hidden) pollTimer = setTimeout(tick, wait);
}

export function startPolling() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(pollTimer);
    else tick();
  });
  tick();
}

export function retryNow() {
  live.phase = 'loading';
  emit();
  tick();
}

// Race mode reads faster so the ghost follows the wheel closely.
export function setPollInterval(ms) {
  const faster = ms < pollMs;
  pollMs = ms;
  if (faster && !document.hidden) tick();
}

export const nowMs = () => Date.now() + live.clockOffset;
export const openRound = () => (live.cfg ? roundAt(nowMs(), live.cfg) : null);

export function reading() {
  const m = live.status?.measurement;
  if (!m) return { known: false };
  return {
    known: true,
    stale: m.freshness !== 'online' || live.phase === 'error',
    state: m.coreStatus,
    speed: m.speedMmPerSecond / 1000,
    rpm: m.rpmMilli / 1000,
    distance: m.distanceMm / 1000,
  };
}

// The ghost moves only on a current, accepted, running reading.
export function ghostSpeed() {
  const r = reading();
  return r.known && !r.stale && r.state === 'ACTIVE' ? r.speed : 0;
}

export function wheelLabel() {
  const r = reading();
  if (!r.known) return live.phase === 'error' ? 'Wheel reading unavailable' : 'Reading the wheel…';
  if (r.stale) return 'Last wheel reading is stale';
  if (r.state === 'ACTIVE') return 'Squeektoshi is running';
  if (r.state === 'COUNTER_FAULT') return 'Wheel sensor fault';
  return 'Wheel is still';
}

// Work in the open round so far, or null when the builder is not reporting it.
export function openRoundWork() {
  const builder = live.status?.builder;
  if (builder?.status !== 'available') return null;
  const work = Number(builder.queued?.openRoundWorkUnits);
  return Number.isFinite(work) ? work : null;
}

export function formRows(count) {
  const open = openRound();
  return open === null ? [] : recentRounds(live.cum, open - 1, count);
}

export const roundStats = () => live.stats?.rounds ?? null;
export const halfHourCells = () => (live.stats ? halfHours(live.stats) : []);
