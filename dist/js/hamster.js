// Canvas art shared by the home wheel and the race. Flat fills only.
export const ART = {
  fur: '#FFF1DC',
  patch: '#EE9A45',
  cheek: '#FFD9B0',
  ear: '#F4A78F',
  eye: '#17171C',
  nose: '#E4735F',
  foot: '#F6C9A0',
  ghost: '#5B7CFA',
  ghostFill: '#262C4C',
  arena: '#1F2231',
  pit: '#14151C',
  rim: '#2C3047',
  tile: '#5B7CFA',
  tileAlt: '#4A69DE',
  tileDeep: '#2A3566',
  pellet: '#E9B45F',
  pelletDark: '#C68A38',
  pipe: '#3A3F58',
  ramp: '#A9BBFF',
  rampEdge: '#7F96F2',
  mark: '#8C90A8',
};

function blob(ctx, x, y, rx, ry, fill, ghost, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  if (ghost) {
    ctx.fillStyle = ART.ghostFill;
    ctx.fill();
    ctx.strokeStyle = ART.ghost;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

// Draws with feet at (x, y), facing right. `pose` is run, jump, slide or sleep.
export function drawHamster(ctx, x, y, size, { pose = 'run', phase = 0, ghost = false } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  if (pose === 'sleep') {
    blob(ctx, -22, -7, 4, 3, ART.foot, ghost);
    blob(ctx, 0, -15, 25, 15, ART.fur, ghost);
    if (!ghost) blob(ctx, -7, -20, 13, 8, ART.patch, false);
    blob(ctx, 15, -28, 5, 5, ART.ear, ghost);
    blob(ctx, 17, -15, 12, 11, ART.fur, ghost);
    if (!ghost) blob(ctx, 21, -11, 6, 5, ART.cheek, false);
    ctx.beginPath();
    ctx.arc(19, -19, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = ghost ? ART.ghost : ART.eye;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (pose === 'slide') ctx.scale(1.2, 0.6);

  const swing = pose === 'run' ? Math.sin(phase) : 0;
  const lift = pose === 'run' ? Math.max(0, Math.cos(phase)) * 3 : 0;
  const tuck = pose === 'jump' ? 6 : 0;

  blob(ctx, -25, -20, 4, 3, ART.foot, ghost, -0.4);
  blob(ctx, -9 + swing * 7, -3 - tuck, 6, 3.5, ART.foot, ghost);
  blob(ctx, 15 - swing * 7, -3 - tuck, 6, 3.5, ART.foot, ghost);
  blob(ctx, -3, -19, 24, 16, ART.fur, ghost);
  if (!ghost) blob(ctx, -9, -25, 14, 9, ART.patch, false);
  blob(ctx, 11, -38, 5, 5.5, ART.ear, ghost);
  blob(ctx, 18, -25, 14, 13, ART.fur, ghost);
  if (!ghost) {
    blob(ctx, 11, -38, 2.6, 3, ART.nose, false);
    blob(ctx, 21, -19, 8, 6.5, ART.cheek, false);
  }
  blob(ctx, 23, -28, 2.5, 2.8, ghost ? ART.ghost : ART.eye, false);
  if (!ghost) blob(ctx, 23.8, -29, 0.8, 0.8, ART.fur, false);
  blob(ctx, 31.5, -24, 1.8, 1.5, ghost ? ART.ghost : ART.nose, false);
  blob(ctx, -14 - swing * 7, -3 - lift - tuck, 6, 3.5, ART.foot, ghost);
  blob(ctx, 8 + swing * 7, -3 - lift - tuck, 6, 3.5, ART.foot, ghost);

  ctx.restore();
}

// A rim studded with square tiles. `angle` follows the real wheel on the home screen.
export function drawWheel(ctx, cx, cy, radius, angle, { rim = ART.rim, stud = ART.tile, spokes = 8 } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(2, radius * 0.03);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(angle);
  ctx.beginPath();
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  ctx.stroke();
  const studs = 24;
  const side = Math.max(3, radius * 0.05);
  ctx.fillStyle = stud;
  for (let i = 0; i < studs; i += 1) {
    const a = (i / studs) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(radius - side / 2, -side / 2, side, side);
    ctx.restore();
  }
  ctx.restore();
}

// Sizes a canvas to its box for this device and returns the box in CSS pixels.
export function fitCanvas(canvas) {
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(box.width * dpr));
  const height = Math.max(1, Math.round(box.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width: box.width, height: box.height, dpr };
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
