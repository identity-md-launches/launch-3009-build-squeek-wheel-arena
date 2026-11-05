// Small DOM helpers and shared interface pieces. Text only reaches the page as textContent.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export const fmtM = (metres, digits = 1) =>
  `${metres.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} m`;
export const fmtSpeed = (mps) => `${mps.toFixed(2)} m/s`;
export const fmtPoints = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'point' : 'points'}`;
export const fmtMult = (mult) => `×${mult.toFixed(1)}`;

export function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${String(minutes).padStart(2, '0')}:${seconds}`;
}

export function fmtUtcTime(ms) {
  const date = new Date(ms);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

// The brand tile: a square glyph that stands in for the round's work.
function tile(x, y, side, state) {
  const rect = svg('rect', { x, y, width: side, height: side, rx: 1 });
  rect.setAttribute('class', `tile tile-${state}`);
  return rect;
}

const niceStep = (max) => Math.max(25, Math.ceil(max / 8 / 25) * 25);

// One column per closed round, newest on the right.
export function roundChart(rows, metresOf) {
  const pitch = 10;
  const side = 8;
  const levels = 8;
  const known = rows.filter((row) => row.work !== null);
  const max = known.reduce((best, row) => Math.max(best, metresOf(row.work)), 0);
  const step = niceStep(max);
  const active = known.filter((row) => row.work > 0).length;
  const root = svg('svg', {
    viewBox: `0 0 ${Math.max(1, rows.length) * pitch - 2} ${levels * pitch - 2}`,
    role: 'img',
    class: 'tile-chart',
    'aria-label': `Last ${rows.length} rounds. ${known.length} reported, ${active} with wheel turns, best ${Math.round(max)} metres.`,
  });
  rows.forEach((row, col) => {
    const x = col * pitch;
    const title = svg('title');
    const group = svg('g');
    if (row.work === null) {
      group.append(tile(x, (levels - 1) * pitch, side, 'unknown'));
      title.textContent = `Round ${row.round}: not reported yet`;
    } else if (row.work === 0) {
      group.append(tile(x, (levels - 1) * pitch, side, 'still'));
      title.textContent = `Round ${row.round}: wheel still`;
    } else {
      const metres = metresOf(row.work);
      const count = Math.min(levels, Math.ceil(metres / step));
      for (let i = 0; i < count; i += 1) group.append(tile(x, (levels - 1 - i) * pitch, side, 'on'));
      title.textContent = `Round ${row.round}: ${metres.toFixed(1)} m`;
    }
    group.prepend(title);
    root.append(group);
  });
  root.dataset.step = String(step);
  return root;
}

// 48 half-hour cells, oldest first, shaded by share of the busiest cell.
export function halfHourChart(cells) {
  const pitch = 6;
  const side = 5;
  const root = svg('svg', {
    viewBox: `0 0 ${Math.max(1, cells.length) * pitch - 1} ${side}`,
    role: 'img',
    class: 'tile-strip',
  });
  const busiest = cells.reduce((best, cell) => Math.max(best, cell.work ?? 0), 0);
  let activeCells = 0;
  cells.forEach((cell, index) => {
    let state = 'still';
    if (cell.work === null) state = 'unknown';
    else if (cell.work > 0) {
      activeCells += 1;
      state = cell.work >= busiest / 2 ? 'on' : 'low';
    }
    root.append(tile(index * pitch, 0, side, state));
  });
  root.setAttribute('aria-label', `Last ${cells.length} half hours. The wheel turned in ${activeCells} of them.`);
  return root;
}

// Tiles fill one by one with the streak, so a badge reads the same at any size.
export function badgeGlyph(weeks, earned) {
  const root = svg('svg', { viewBox: '0 0 34 34', class: 'badge-glyph', 'aria-hidden': 'true' });
  const cells = Math.min(weeks, 12);
  const perRow = cells <= 4 ? 2 : cells <= 9 ? 3 : 4;
  const side = (34 - (perRow - 1) * 2) / perRow;
  for (let i = 0; i < cells; i += 1) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    root.append(tile(col * (side + 2), row * (side + 2), side, earned ? 'on' : 'unknown'));
  }
  return root;
}

const OUTCOME_WORD = {
  pending: 'Open',
  won: 'Won',
  lost: 'Lost',
  push: 'Push',
  rest: 'Walkover',
  void: 'Void',
};

function entryName(entry) {
  if (entry.kind === 'race') return `Race, round ${entry.round}`;
  if (entry.kind === 'over') return `Over ${entry.line} m, round ${entry.round}`;
  if (entry.kind === 'under') return `Under ${entry.line} m, round ${entry.round}`;
  if (entry.kind === 'sprint') return `Sprint, round ${entry.round}`;
  return `Rest, round ${entry.round}`;
}

function entryDetail(entry) {
  if (entry.kind === 'race') {
    if (entry.status === 'pending') return `You ran ${fmtM(entry.metres)}. Settles after the round closes.`;
    if (entry.status === 'void') return `You ran ${fmtM(entry.metres)}. The API no longer shows this round, so no points.`;
    if (entry.status === 'rest') return `You ran ${fmtM(entry.metres)}. His wheel stayed still: +${fmtPoints(entry.payout)}.`;
    if (entry.status === 'won') return `You ran ${fmtM(entry.metres)}, he ran ${fmtM(entry.result)}: +${fmtPoints(entry.payout)}.`;
    return `You ran ${fmtM(entry.metres)}, he ran ${fmtM(entry.result)}: +${fmtPoints(entry.payout)}.`;
  }
  if (entry.status === 'pending') {
    return `${fmtPoints(entry.stake)} at ${fmtMult(entry.mult)}. Pays ${fmtPoints(Math.round(entry.stake * entry.mult))}.`;
  }
  if (entry.status === 'void') return `The API no longer shows this round: ${fmtPoints(entry.stake)} returned.`;
  if (entry.status === 'push') return `He ran exactly ${fmtM(entry.result)}: ${fmtPoints(entry.stake)} returned.`;
  if (entry.status === 'won') return `He ran ${fmtM(entry.result)}: +${fmtPoints(entry.payout)}.`;
  return `He ran ${fmtM(entry.result)}: −${fmtPoints(entry.stake)}.`;
}

export function entryRow(entry) {
  return el(
    'li',
    { class: `entry entry-${entry.status}` },
    el('span', { class: 'entry-word', text: OUTCOME_WORD[entry.status] }),
    el(
      'span',
      { class: 'entry-body' },
      el('span', { class: 'entry-name', text: entryName(entry) }),
      el('span', { class: 'entry-detail', text: entryDetail(entry) }),
    ),
  );
}

export function replaceChildren(node, ...children) {
  node.replaceChildren(...children.filter(Boolean));
}

export const summaryOf = (entry) => `${entryName(entry)}. ${entryDetail(entry)}`;
