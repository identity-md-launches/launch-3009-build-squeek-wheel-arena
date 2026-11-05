import { ghostSpeed, live, nowMs, openRound, openRoundWork, reading, retryNow, setPollInterval, wheelLabel } from './api.js';
import { prefersReducedMotion } from './hamster.js';
import { metresFromWork, roundEndMs } from './rounds.js';
import { renderScene } from './scene.js';
import { createSim, stepSim } from './sim.js';
import { bankRace, player, subscribe } from './store.js';
import { el, entryRow, fmtClock, fmtM, fmtSpeed, fmtUtcTime, replaceChildren } from './ui.js';

const STEP = 1 / 120;
const FAST_POLL_MS = 2000;
const NORMAL_POLL_MS = 5000;

function hudCell(label, extra) {
  const value = el('span', { class: 'mono hud-value', text: '0.0 m' });
  const sub = el('span', { class: 'note hud-sub', text: extra });
  return { cell: el('div', { class: 'hud-cell' }, el('span', { class: 'label', text: label }), value, sub), value, sub };
}

export function mountRace(root) {
  const heading = el('h1', { class: 'title', text: 'Race Squeektoshi' });
  const clock = el('p', { class: 'mono race-clock' });
  const you = hudCell('You', '');
  const him = hudCell('Squeektoshi', '');
  const lives = hudCell('Lives', '');
  const canvas = el('canvas', {
    class: 'stage-canvas',
    role: 'img',
    'aria-label': 'Race track with your hamster, the ghost of Squeektoshi, pellets, ramps and gaps.',
  });
  const panel = el('div', { class: 'stage-panel' });
  const stage = el('div', { class: 'stage' }, canvas, panel);
  const announcer = el('p', { class: 'sr-only', role: 'status' });
  const jumpBtn = el('button', { class: 'btn btn-quiet pad', type: 'button', text: 'Jump' });
  const slideBtn = el('button', { class: 'btn btn-quiet pad', type: 'button', text: 'Slide' });
  const totalsYou = el('dd', { class: 'mono' });
  const totalsHim = el('dd', { class: 'mono' });
  const resultList = el('ul', { class: 'entries' });
  const emptyNote = el('p', { class: 'note', text: 'Your first run opens an entry for the current round.' });

  root.append(
    el('div', { class: 'view-head' }, heading, clock),
    el('div', { class: 'hud' }, you.cell, him.cell, lives.cell),
    stage,
    el('div', { class: 'pads' }, jumpBtn, slideBtn),
    el('p', { class: 'note', text: 'Press Space or the up arrow to jump, the down arrow to slide, and Esc to pause.' }),
    announcer,
    el(
      'section',
      { class: 'band' },
      el('h2', { class: 'title', text: 'This round so far' }),
      el(
        'dl',
        { class: 'stats' },
        el('div', { class: 'stat' }, el('dt', { class: 'label', text: 'Your metres' }), totalsYou),
        el('div', { class: 'stat' }, el('dt', { class: 'label', text: 'His metres' }), totalsHim),
      ),
      el(
        'p',
        { class: 'note', text: 'Your points wait for the closed round: your metres up to 300, plus 100 if you beat his round. Otherwise half your metres.' },
      ),
    ),
    el('section', { class: 'band' }, el('h2', { class: 'title', text: 'Race results' }), emptyNote, resultList),
  );

  const reduced = prefersReducedMotion();
  let sim = createSim(1);
  let running = false;
  let paused = false;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let banked = 0;
  let bankRound = null;
  let runCount = 0;
  let hudAt = 0;
  const input = { jump: false, slide: false, slideHeld: false };

  setPollInterval(FAST_POLL_MS);

  const ghostRunning = () => ghostSpeed() > 0;
  const draw = () => renderScene(canvas, sim, { ghostRunning: ghostRunning(), reduced });

  function bank(finishedRun = false) {
    if (bankRound === null) return;
    const delta = sim.dist - banked;
    banked = sim.dist;
    if (delta > 0 || (finishedRun && sim.dist > 0)) {
      bankRace(bankRound, delta, { finishedRun, runMetres: sim.dist });
    }
  }

  function showPanel(title, lines, button) {
    panel.hidden = false;
    replaceChildren(
      panel,
      el('p', { class: 'title panel-title', text: title }),
      ...lines.map((line) => el('p', { class: 'note', text: line })),
      button,
    );
  }

  function readyPanel() {
    const open = openRound();
    if (open !== null) {
      showPanel(
        `Race round ${open}`,
        ['Dodge pellets and gaps, and take ramps at a run.'],
        el('button', { class: 'btn btn-primary', type: 'button', text: 'Start race', onclick: start }),
      );
    } else if (live.phase === 'error') {
      showPanel(
        'Unable to read the round',
        ['A race needs the live round from the API. Check your connection and try again.'],
        el('button', { class: 'btn btn-quiet', type: 'button', text: 'Try again', onclick: retryNow }),
      );
    } else {
      showPanel('Reading the round…', [], null);
    }
  }

  function start() {
    const open = openRound();
    if (open === null) return;
    runCount += 1;
    // Everyone racing a round gets the same course for their first run.
    sim = createSim(open * 1000 + runCount);
    running = true;
    paused = false;
    banked = 0;
    bankRound = open;
    acc = 0;
    last = performance.now();
    panel.hidden = true;
    replaceChildren(panel);
    announcer.textContent = 'Race started.';
    canvas.focus({ preventScroll: true });
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (!running || paused) return;
    paused = true;
    showPanel(
      'Paused',
      [],
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Resume race', onclick: resume }),
    );
    panel.querySelector('button').focus();
  }

  function resume() {
    if (!paused) return;
    paused = false;
    panel.hidden = true;
    last = performance.now();
    canvas.focus({ preventScroll: true });
  }

  function endRun() {
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
    const round = bankRound;
    bank(true);
    bankRound = null;
    const reason = sim.endReason === 'gap' ? 'You fell in a gap.' : 'You ran out of lives.';
    const settles = live.cfg ? fmtUtcTime(roundEndMs(round, live.cfg)) : null;
    const summary = `Squeektoshi’s ghost ran ${fmtM(sim.ghost)} in that time.`;
    showPanel(
      `You ran ${fmtM(sim.dist)}`,
      [
        `${reason} ${summary}`,
        settles ? `Banked for round ${round}, which closes at ${settles}.` : `Banked for round ${round}.`,
      ],
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Race again', onclick: start }),
    );
    announcer.textContent = `Run over. You ran ${fmtM(sim.dist)}.`;
    panel.querySelector('button').focus();
    draw();
    updateHud();
  }

  function updateHud() {
    you.value.textContent = fmtM(sim.dist);
    you.sub.textContent = running || sim.dist > 0 ? fmtSpeed(sim.speed) : 'Ready';
    him.value.textContent = fmtM(sim.ghost);
    const r = reading();
    him.sub.textContent = r.known && !r.stale && r.state === 'ACTIVE' ? fmtSpeed(r.speed) : wheelLabel();
    lives.value.textContent = String(sim.lives);
    lives.sub.textContent = sim.lives === 1 ? 'Last life' : 'Stumbles cost one';
  }

  function loop(ts) {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (paused) return;
    const ghost = ghostSpeed();
    acc += dt;
    while (acc >= STEP) {
      stepSim(sim, STEP, input, ghost);
      input.jump = false;
      input.slide = false;
      acc -= STEP;
      if (sim.over) break;
    }
    const open = openRound();
    if (open !== null && open !== bankRound) {
      bank();
      bankRound = open;
    }
    draw();
    if (ts - hudAt > 100) {
      hudAt = ts;
      updateHud();
    }
    if (sim.over) endRun();
  }

  const isTyping = (target) => target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);

  function onKeyDown(event) {
    if (!running || isTyping(event.target)) return;
    if (event.code === 'Escape' || event.code === 'KeyP') {
      event.preventDefault();
      if (paused) resume();
      else pause();
      return;
    }
    if (paused) return;
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      if (!event.repeat) input.jump = true;
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      if (!event.repeat) input.slide = true;
      input.slideHeld = true;
    }
  }

  function onKeyUp(event) {
    if (event.code === 'ArrowDown' || event.code === 'KeyS') input.slideHeld = false;
  }

  function onHide() {
    if (document.hidden) pause();
  }

  const onPageHide = () => bank();

  const pressJump = (event) => {
    event.preventDefault();
    if (running && !paused) input.jump = true;
  };
  const pressSlide = (event) => {
    event.preventDefault();
    if (running && !paused) {
      input.slide = true;
      input.slideHeld = true;
    }
  };
  const releaseSlide = () => {
    input.slideHeld = false;
  };

  jumpBtn.addEventListener('pointerdown', pressJump);
  slideBtn.addEventListener('pointerdown', pressSlide);
  slideBtn.addEventListener('pointerup', releaseSlide);
  slideBtn.addEventListener('pointercancel', releaseSlide);
  slideBtn.addEventListener('pointerleave', releaseSlide);
  // A keyboard click has detail 0. Pointer presses already acted on pointerdown.
  jumpBtn.addEventListener('click', (event) => {
    if (event.detail === 0 && running && !paused) input.jump = true;
  });
  slideBtn.addEventListener('click', (event) => {
    if (event.detail === 0 && running && !paused) input.slide = true;
  });
  canvas.addEventListener('pointerdown', pressJump);
  canvas.setAttribute('tabindex', '-1');
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onHide);

  const resize = new ResizeObserver(() => {
    if (!running || paused) draw();
  });
  resize.observe(canvas);

  function renderResults() {
    const entries = player().entries.filter((entry) => entry.kind === 'race').slice(-6).reverse();
    emptyNote.hidden = entries.length > 0;
    replaceChildren(resultList, ...entries.map(entryRow));
  }
  const unsubscribe = subscribe(renderResults);
  renderResults();

  let panelState = '';

  function update() {
    const open = openRound();
    clock.textContent = open === null ? 'Round unknown' : `Round ${open} closes in ${fmtClock(roundEndMs(open, live.cfg) - nowMs())}`;
    const entry = player().entries.find((item) => item.kind === 'race' && item.round === open && item.status === 'pending');
    const inRun = running && bankRound === open ? sim.dist - banked : 0;
    totalsYou.textContent = fmtM((entry?.metres ?? 0) + inRun);
    const work = openRoundWork();
    totalsHim.textContent = work === null ? 'Unknown' : fmtM(metresFromWork(work));
    if (!running) {
      updateHud();
      // Only the idle panel follows the API. An end-of-run panel stays until dismissed.
      const nextState = open !== null ? `ready:${open}` : live.phase;
      if (runCount === 0 && nextState !== panelState) {
        panelState = nextState;
        const hadFocus = panel.contains(document.activeElement);
        readyPanel();
        if (hadFocus) panel.querySelector('button')?.focus();
      }
    }
  }

  readyPanel();
  draw();
  updateHud();

  return {
    title: 'Race Squeektoshi · Squeek Wheel Arena',
    update,
    destroy() {
      if (running) {
        bank(true);
        running = false;
      }
      cancelAnimationFrame(frame);
      resize.disconnect();
      unsubscribe();
      setPollInterval(NORMAL_POLL_MS);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
