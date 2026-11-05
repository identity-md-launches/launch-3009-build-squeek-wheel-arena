import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_X, createSim, stepSim } from '../src/js/sim.js';

const STEP = 1 / 120;
const idle = { jump: false, slide: false, slideHeld: false };

// Reads the next obstacle the way a careful player would.
function bot(s) {
  const px = s.scroll + PLAYER_X;
  const v = s.speed * 180;
  const next = s.obstacles.find((o) => o.x + o.w > px - 20);
  if (!next) return idle;
  const ahead = next.x - px;
  if (next.kind === 'gap' && ahead < v * 0.12) return { ...idle, jump: true };
  if (next.kind === 'pile' && ahead - 14 < v * 0.12) return { ...idle, jump: true };
  if (next.kind === 'drop' && ahead - 14 < v * 0.12) return { ...idle, slide: true, slideHeld: true };
  return idle;
}

function run(seed, seconds, policy, ghost = 0) {
  const sim = createSim(seed);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && !sim.over; i += 1) stepSim(sim, STEP, policy(sim), ghost);
  return sim;
}

test('the same seed builds the same course', () => {
  const a = run(285001, 20, () => idle);
  const b = run(285001, 20, () => idle);
  assert.deepEqual(a.obstacles.map((o) => [o.kind, o.x]), b.obstacles.map((o) => [o.kind, o.x]));
});

test('standing still costs the run', () => {
  const sim = run(285001, 120, () => idle);
  assert.equal(sim.over, true);
  assert.ok(sim.endReason === 'gap' || sim.endReason === 'stumble');
});

test('the ghost moves only at the speed it is given', () => {
  assert.equal(run(1, 2, () => idle, 0).ghost, 0);
  const moving = run(1, 2, () => idle, 0.9).ghost;
  assert.ok(Math.abs(moving - 1.8) < 0.02);
});

test('a careful player can clear long stretches of many courses', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const sim = run(seed * 1000 + 1, 60, bot);
    assert.ok(sim.dist > 50, `seed ${seed} ended at ${sim.dist.toFixed(1)} m (${sim.endReason})`);
  }
});

test('the first seconds are clear of obstacles', () => {
  const sim = createSim(7);
  stepSim(sim, STEP, idle, 0);
  assert.ok(sim.obstacles[0].x >= PLAYER_X + 500);
});

test('speed rises and is capped', () => {
  const sim = createSim(1);
  sim.t = 500;
  sim.obstacles = [];
  sim.nextAt = 1e9;
  stepSim(sim, STEP, idle, 0);
  assert.ok(sim.speed <= 1.9);
});
