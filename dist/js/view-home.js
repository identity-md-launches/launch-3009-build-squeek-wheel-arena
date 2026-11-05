import { live, nowMs, openRound, openRoundWork, formRows, reading, retryNow, wheelLabel } from './api.js';
import { ART, drawHamster, drawWheel, fitCanvas, prefersReducedMotion } from './hamster.js';
import { metresFromWork, roundEndMs, workOfRound } from './rounds.js';
import { el, fmtClock, fmtM, fmtSpeed, replaceChildren, roundChart } from './ui.js';

const FORM_ROUNDS = 24;

function stat(label) {
  const value = el('dd', { class: 'mono', text: '…' });
  return { row: el('div', { class: 'stat' }, el('dt', { class: 'label', text: label }), value), value };
}

export function mountHome(root) {
  const figure = el('p', { class: 'figure', text: '…' });
  const state = el('p', { class: 'label readout-state' });
  const speed = stat('Speed');
  const round = stat('Open round');
  const closes = stat('Closes in');
  const soFar = stat('This round');
  const latest = stat('Latest closed');
  const retry = el('button', { class: 'btn btn-quiet', type: 'button', hidden: true, text: 'Try again', onclick: retryNow });
  const canvas = el('canvas', { class: 'wheel-canvas', 'aria-hidden': 'true' });
  const predictLabel = el('span', { class: 'mode-title', text: 'Call the next round' });
  const chartSlot = el('div', { class: 'chart-slot' });
  const chartNote = el('p', { class: 'note' });

  root.append(
    el(
      'section',
      { class: 'hero' },
      el(
        'div',
        { class: 'hero-copy' },
        el('h1', { class: 'display', text: 'Outrun a real hamster.' }),
        el('p', { class: 'lede', text: 'Race or bet against Squeektoshi’s live wheel, scored on every real round.' }),
      ),
      el(
        'nav',
        { class: 'menu', 'aria-label': 'Game modes' },
        el(
          'a',
          { class: 'btn btn-primary mode', href: '#/race' },
          el('span', { class: 'mode-title', text: 'Start a race' }),
          el('span', { class: 'mode-note', text: 'Jump and slide against his live speed' }),
        ),
        el(
          'a',
          { class: 'btn btn-quiet mode', href: '#/predict' },
          predictLabel,
          el('span', { class: 'mode-note', text: 'Bet on his distance before the round starts' }),
        ),
      ),
      el(
        'section',
        { class: 'readout', 'aria-label': 'Live wheel' },
        el(
          'div',
          { class: 'readout-main' },
          state,
          figure,
          el('p', { class: 'label', text: 'Distance since noon UTC' }),
          retry,
        ),
        canvas,
        el('dl', { class: 'stats' }, speed.row, round.row, closes.row, soFar.row, latest.row),
      ),
    ),
    el(
      'section',
      { class: 'band' },
      el('h2', { class: 'title', text: 'Recent rounds' }),
      chartSlot,
      chartNote,
    ),
    el(
      'section',
      { class: 'band' },
      el('h2', { class: 'title', text: 'How outcomes settle' }),
      el(
        'ul',
        { class: 'plain-list' },
        el('li', { text: 'Rounds last ten minutes. Each closed round reports the turns his wheel recorded, at 0.878 m a turn.' }),
        el('li', { text: 'A race adds up the metres you run during a round. Beat his metres for that round to earn the win bonus.' }),
        el('li', { text: 'A bet locks before its round starts and pays only on that round’s reported result.' }),
      ),
    ),
  );

  const reduced = prefersReducedMotion();
  let angle = 0;
  let frame = 0;
  let last = 0;

  function drawFrame() {
    const box = fitCanvas(canvas);
    if (box.width < 2) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    const radius = Math.min(box.width, box.height) / 2 - 4;
    const cx = box.width / 2;
    const cy = box.height / 2;
    drawWheel(ctx, cx, cy, radius, angle, { rim: '#3A3A44', stud: ART.tile });
    const r = reading();
    const running = r.known && !r.stale && r.state === 'ACTIVE' && r.rpm > 0;
    drawHamster(ctx, cx, cy + radius - radius * 0.1, radius / 62, {
      pose: running ? 'run' : 'sleep',
      phase: angle * 6,
    });
  }

  // The wheel turns only at his reported rpm. A still wheel draws one frame and stops.
  function animate(ts) {
    const r = reading();
    const running = r.known && !r.stale && r.state === 'ACTIVE' && r.rpm > 0;
    if (!running || reduced) {
      frame = 0;
      drawFrame();
      return;
    }
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    angle -= ((r.rpm / 60) * Math.PI * 2) * dt;
    drawFrame();
    frame = requestAnimationFrame(animate);
  }

  function ensureAnimating() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(animate);
  }

  const resize = new ResizeObserver(() => drawFrame());
  resize.observe(canvas);

  let chartKey = '';

  function update() {
    const r = reading();
    state.textContent = wheelLabel();
    figure.textContent = r.known ? fmtM(r.distance) : 'Unknown';
    speed.value.textContent = r.known && !r.stale ? fmtSpeed(r.speed) : 'Unknown';
    retry.hidden = live.phase !== 'error';

    const open = openRound();
    if (open === null) {
      round.value.textContent = 'Unknown';
      closes.value.textContent = 'Unknown';
      latest.value.textContent = 'Unknown';
      soFar.value.textContent = 'Unknown';
      ensureAnimating();
      return;
    }
    round.value.textContent = String(open);
    closes.value.textContent = fmtClock(roundEndMs(open, live.cfg) - nowMs());
    predictLabel.textContent = `Call round ${open + 1}`;
    const work = openRoundWork();
    soFar.value.textContent = work === null ? 'Unknown' : fmtM(metresFromWork(work));
    const closedWork = workOfRound(live.cum, open - 1);
    latest.value.textContent = closedWork === null ? `${open - 1}: not reported yet` : `${open - 1}: ${fmtM(metresFromWork(closedWork))}`;

    const rows = formRows(FORM_ROUNDS);
    const key = rows.map((row) => row.work).join(',') + open;
    if (key !== chartKey) {
      chartKey = key;
      const chart = roundChart(rows, metresFromWork);
      replaceChildren(chartSlot, chart);
      const step = chart.dataset.step;
      chartNote.textContent = `Last ${rows.length} rounds, newest on the right. One tile is up to ${step} m. A dim tile is a still wheel, and an outline is not reported yet.`;
    }
    ensureAnimating();
  }

  return {
    title: 'Squeek Wheel Arena',
    update,
    destroy() {
      cancelAnimationFrame(frame);
      resize.disconnect();
    },
  };
}
