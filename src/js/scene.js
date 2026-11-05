// Draws one frame of the race. This is the bright part of the site.
import { ART, drawHamster, drawWheel, fitCanvas } from './hamster.js';
import { GROUND_Y, PLAYER_X, PX_PER_M, TILE, VIEW_H, inGap, isSliding } from './sim.js';

const MONO = "11px 'IBM Plex Mono', ui-monospace, monospace";
const MIN_VIEW_W = 560;

function drawFloor(ctx, s, viewW) {
  ctx.fillStyle = ART.pit;
  ctx.fillRect(0, GROUND_Y, viewW, VIEW_H - GROUND_Y);
  const first = Math.floor(s.scroll / TILE) - 1;
  for (let i = first; (i * TILE) - s.scroll < viewW; i += 1) {
    const wx = i * TILE;
    if (inGap(s, wx + TILE / 2)) continue;
    const sx = wx - s.scroll;
    ctx.fillStyle = i % 2 === 0 ? ART.tile : ART.tileAlt;
    ctx.fillRect(sx + 1, GROUND_Y + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = ART.tileDeep;
    ctx.fillRect(sx + 1, GROUND_Y + TILE + 1, TILE - 2, VIEW_H - GROUND_Y - TILE);
  }
}

function drawPellet(ctx, x, y, r) {
  ctx.fillStyle = ART.pellet;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.8, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ART.pelletDark;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.2, y + r * 0.2, r * 0.3, r * 0.2, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawObstacle(ctx, o, s, top) {
  const sx = o.x - s.scroll;
  if (o.kind === 'pile') {
    const count = Math.max(2, Math.floor(o.w / 13));
    for (let i = 0; i < count; i += 1) {
      drawPellet(ctx, sx + 7 + (i * (o.w - 14)) / Math.max(1, count - 1), GROUND_Y - 6, 7);
    }
    for (let i = 0; i < count - 1; i += 1) {
      drawPellet(ctx, sx + 13 + (i * (o.w - 26)) / Math.max(1, count - 2 || 1), GROUND_Y - 17, 7);
    }
  } else if (o.kind === 'drop') {
    const bottom = GROUND_Y - o.bottom;
    ctx.fillStyle = ART.pipe;
    ctx.fillRect(sx + o.w / 2 - 10, top, 20, Math.max(0, bottom - 60 - top));
    const rows = 4;
    for (let row = 0; row < rows; row += 1) {
      const y = bottom - 8 - row * 15;
      drawPellet(ctx, sx + 9, y, 8);
      drawPellet(ctx, sx + o.w - 9, y, 8);
      drawPellet(ctx, sx + o.w / 2, y - 6, 8);
    }
  } else if (o.kind === 'ramp') {
    ctx.fillStyle = ART.ramp;
    ctx.beginPath();
    ctx.moveTo(sx, GROUND_Y);
    ctx.lineTo(sx + o.w, GROUND_Y - o.h);
    ctx.lineTo(sx + o.w, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ART.rampEdge;
    ctx.fillRect(sx + o.w - 6, GROUND_Y - o.h, 6, o.h);
  }
}

function drawMarkers(ctx, s, viewW) {
  const metresPerMark = 10;
  const firstMark = Math.ceil((s.dist - PLAYER_X / PX_PER_M) / metresPerMark) * metresPerMark;
  ctx.font = MONO;
  ctx.textAlign = 'center';
  for (let m = Math.max(metresPerMark, firstMark); ; m += metresPerMark) {
    const sx = PLAYER_X + (m - s.dist) * PX_PER_M;
    if (sx > viewW + 40) break;
    if (inGap(s, m * PX_PER_M + PLAYER_X)) continue;
    ctx.fillStyle = ART.mark;
    ctx.fillRect(sx - 1, GROUND_Y - 22, 2, 22);
    ctx.fillText(`${m} m`, sx, GROUND_Y - 28);
  }
}

function drawGhost(ctx, s, viewW, ghostRunning) {
  const sx = PLAYER_X + (s.ghost - s.dist) * PX_PER_M;
  ctx.font = MONO;
  ctx.fillStyle = ART.ghost;
  if (sx < -40 || sx > viewW + 40) {
    const behind = sx < 0;
    const edge = behind ? 12 : viewW - 12;
    const gap = Math.abs(s.ghost - s.dist).toFixed(1);
    ctx.beginPath();
    ctx.moveTo(edge + (behind ? -6 : 6), 40);
    ctx.lineTo(edge + (behind ? 6 : -6), 33);
    ctx.lineTo(edge + (behind ? 6 : -6), 47);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = behind ? 'left' : 'right';
    ctx.fillStyle = '#C9D3FF';
    ctx.fillText(`${gap} m`, edge + (behind ? 12 : -12), 44);
    return;
  }
  const pose = ghostRunning ? 'run' : 'sleep';
  drawHamster(ctx, sx, GROUND_Y, 0.95, { pose, phase: s.ghost * 6 * Math.PI, ghost: true });
}

// `options.ghostRunning` is true when the real wheel is turning.
export function renderScene(canvas, s, { ghostRunning, reduced }) {
  const box = fitCanvas(canvas);
  const ctx = canvas.getContext('2d');
  // Tall phones keep enough track ahead to react: the floor stays at the bottom and extra
  // height becomes open space above the scene.
  const scale = Math.min(box.height / VIEW_H, box.width / MIN_VIEW_W);
  const viewW = box.width / scale;
  const viewH = box.height / scale;
  const top = VIEW_H - viewH;
  ctx.setTransform(box.dpr * scale, 0, 0, box.dpr * scale, 0, -top * scale * box.dpr);

  ctx.fillStyle = ART.arena;
  ctx.fillRect(0, top, viewW, viewH);
  drawWheel(ctx, viewW * 0.62, 150, 250, reduced ? 0 : s.scroll / 250);

  drawFloor(ctx, s, viewW);
  drawMarkers(ctx, s, viewW);
  for (const o of s.obstacles) {
    const sx = o.x - s.scroll;
    if (sx + o.w > -20 && sx < viewW + 20) drawObstacle(ctx, o, s, top);
  }
  drawGhost(ctx, s, viewW, ghostRunning);

  const flicker = s.invuln > 0 && !reduced && Math.floor(s.invuln * 12) % 2 === 0;
  if (!flicker) {
    let pose = 'run';
    if (!s.onGround) pose = 'jump';
    if (isSliding(s)) pose = 'slide';
    const faceDown = s.falling ? Math.PI / 3 : 0;
    ctx.save();
    ctx.translate(PLAYER_X, GROUND_Y - s.y);
    if (faceDown) ctx.rotate(faceDown);
    drawHamster(ctx, 0, 0, 1, { pose, phase: s.dist * 6 * Math.PI });
    ctx.restore();
  }
}
