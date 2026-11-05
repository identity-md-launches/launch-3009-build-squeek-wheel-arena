// The race simulation, separate from drawing so `node --test` can run it headless.
// World units: 180 per metre, so one metre in the game is one metre on his wheel.
export const VIEW_H = 360;
export const GROUND_Y = 296;
export const PX_PER_M = 180;
export const PLAYER_X = 110;
export const TILE = 24;
export const LIVES = 3;

const START_SPEED = 1.0;
const ACCEL = 0.012;
const MAX_SPEED = 1.9;
const GRAVITY = 1700;
const JUMP_V = 620;
const RAMP_V = 430;
const SLIDE_MIN = 0.7;
const SPAWN_AHEAD = 1400;
// The hitbox is smaller than the art, so a near miss reads as a miss. A pile of the widest
// allowed size leaves about a third of a second to time the jump at any speed.
const HIT_BACK = 12;
const HIT_FRONT = 14;
const PILE_TIME = 0.35;
const RUN_HEIGHT = 34;
const SLIDE_HEIGHT = 18;

// A small seeded generator. The course shapes the run; it never decides an outcome.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim(seed) {
  return {
    rng: seededRandom(seed),
    t: 0,
    dist: 0,
    ghost: 0,
    speed: START_SPEED,
    scroll: 0,
    y: 0,
    vy: 0,
    onGround: true,
    lastSurface: 0,
    falling: false,
    slideT: 0,
    jumpBuf: 0,
    coyote: 0,
    lives: LIVES,
    invuln: 0,
    slow: 0,
    over: false,
    endReason: null,
    obstacles: [],
    nextAt: PLAYER_X + 3 * START_SPEED * PX_PER_M,
  };
}

function snap(value) {
  return Math.round(value / TILE) * TILE;
}

function spawnAhead(s) {
  while (s.nextAt < s.scroll + SPAWN_AHEAD) {
    const level = Math.min(1, s.nextAt / (PX_PER_M * 120));
    const v = s.speed * PX_PER_M;
    const pick = s.rng();
    let x = s.nextAt;
    let end;
    if (pick < 0.34) {
      const w = Math.max(24, Math.min(30 + s.rng() * 60, v * PILE_TIME - HIT_BACK - HIT_FRONT));
      s.obstacles.push({ kind: 'pile', x, w, h: 22, hit: false });
      end = x + w;
    } else if (pick < 0.6) {
      const w = 40 + s.rng() * 30;
      s.obstacles.push({ kind: 'drop', x, w, bottom: 26, hit: false });
      end = x + w;
    } else if (pick < 0.82) {
      x = snap(x);
      const w = Math.max(TILE * 3, snap(Math.min(v * 0.36, 170)));
      s.obstacles.push({ kind: 'gap', x, w });
      end = x + w;
    } else {
      const w = 130;
      s.obstacles.push({ kind: 'ramp', x, w, h: 46 });
      end = x + w;
      if (level > 0.25 && s.rng() < 0.6) {
        const gapX = snap(end + 24);
        const gapW = Math.max(TILE * 2, snap(Math.min(v * 0.3, 120)));
        s.obstacles.push({ kind: 'gap', x: gapX, w: gapW });
        end = gapX + gapW;
      }
    }
    s.nextAt = end + v * (1.35 - 0.45 * level + s.rng() * 0.7);
  }
  while (s.obstacles.length && s.obstacles[0].x + s.obstacles[0].w < s.scroll - 60) s.obstacles.shift();
}

// Floor height under world x, or null over a gap.
function surfaceAt(s, wx) {
  for (const o of s.obstacles) {
    if (wx < o.x || wx > o.x + o.w) continue;
    if (o.kind === 'gap') return null;
    if (o.kind === 'ramp') return (o.h * (wx - o.x)) / o.w;
  }
  return 0;
}

export function inGap(s, wx) {
  return s.obstacles.some((o) => o.kind === 'gap' && wx >= o.x && wx <= o.x + o.w);
}

function finish(s, reason) {
  s.over = true;
  s.endReason = reason;
}

function stumble(s) {
  if (s.invuln > 0) return;
  s.lives -= 1;
  s.invuln = 1.2;
  s.slow = 0.7;
  s.slideT = 0;
  if (s.lives <= 0) finish(s, 'stumble');
}

// `input` holds edges jump and slide, and the level slideHeld.
export function stepSim(s, dt, input, ghostMps) {
  if (s.over) return;
  s.t += dt;
  s.ghost += ghostMps * dt;

  if (s.falling) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y < -90) finish(s, 'gap');
    return;
  }

  s.slow = Math.max(0, s.slow - dt);
  s.invuln = Math.max(0, s.invuln - dt);
  const base = Math.min(MAX_SPEED, START_SPEED + s.t * ACCEL);
  s.speed = s.slow > 0 ? base * 0.65 : base;
  const moved = s.speed * dt;
  s.dist += moved;
  s.scroll += moved * PX_PER_M;
  spawnAhead(s);

  const px = s.scroll + PLAYER_X;
  s.jumpBuf = input.jump ? 0.12 : Math.max(0, s.jumpBuf - dt);
  s.coyote = Math.max(0, s.coyote - dt);
  s.slideT = Math.max(0, s.slideT - dt);
  if (input.slide) {
    s.slideT = SLIDE_MIN;
    if (!s.onGround) s.vy = Math.min(s.vy, -520);
  }
  if (input.slideHeld) s.slideT = Math.max(s.slideT, 0.05);

  if (s.jumpBuf > 0 && (s.onGround || s.coyote > 0)) {
    s.vy = JUMP_V;
    s.onGround = false;
    s.coyote = 0;
    s.jumpBuf = 0;
    s.slideT = 0;
  }

  const surface = surfaceAt(s, px);
  if (s.onGround) {
    if (surface === null) {
      s.onGround = false;
      s.coyote = 0.08;
      s.vy = 0;
    } else if (s.lastSurface > 20 && surface < s.lastSurface - 20) {
      s.onGround = false;
      s.y = s.lastSurface;
      s.vy = RAMP_V;
    } else {
      s.y = surface;
      s.lastSurface = surface;
    }
  }

  if (!s.onGround) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    const under = surfaceAt(s, px);
    if (under !== null && s.y <= under && s.vy <= 0) {
      s.y = under;
      s.vy = 0;
      s.onGround = true;
      s.lastSurface = under;
    } else if (under === null && s.y < -6) {
      s.falling = true;
      s.onGround = false;
    }
  }

  const sliding = s.onGround && s.slideT > 0;
  if (sliding && surface !== null && surface > 4) stumble(s);

  const left = px - HIT_BACK;
  const right = px + HIT_FRONT;
  const top = s.y + (sliding ? SLIDE_HEIGHT : RUN_HEIGHT);
  for (const o of s.obstacles) {
    if (s.over) break;
    if (o.hit || right < o.x || left > o.x + o.w) continue;
    if ((o.kind === 'pile' && s.y < o.h - 8) || (o.kind === 'drop' && top > o.bottom)) {
      o.hit = true;
      stumble(s);
    }
  }
}

export const isSliding = (s) => s.onGround && s.slideT > 0;
