import { formRows, halfHourCells, live, nowMs, openRound, openRoundWork, roundStats, wheelLabel } from './api.js';
import {
  MM_PER_WORK,
  STAKES,
  marketPrices,
  metresFromWork,
  overUnderLine,
  roundEndMs,
} from './rounds.js';
import { placeBet, player, subscribe } from './store.js';
import { el, entryRow, fmtClock, fmtM, fmtMult, fmtPoints, halfHourChart, replaceChildren, roundChart } from './ui.js';

const FORM_ROUNDS = 24;
const OU_KINDS = ['over', 'under'];
const SR_KINDS = ['sprint', 'rest'];

function pickRow({ kind, title, note, mult, disabled, checked, onChange }) {
  const input = el('input', {
    type: 'radio',
    name: 'pick',
    value: kind,
    id: `pick-${kind}`,
    disabled,
    checked,
    onchange: onChange,
  });
  return el(
    'label',
    { class: 'pick' },
    input,
    el('span', { class: 'pick-body' }, el('span', { class: 'pick-title', text: title }), el('span', { class: 'note', text: note })),
    el('span', { class: 'mono pick-mult', text: mult === null ? '' : fmtMult(mult) }),
  );
}

export function mountPredict(root) {
  const heading = el('h1', { class: 'title' });
  const clock = el('p', { class: 'mono race-clock' });
  const wheel = el('p', { class: 'note' });
  const formSlot = el('div', { class: 'chart-slot' });
  const formNote = el('p', { class: 'note' });
  const stripSlot = el('div', { class: 'chart-slot' });
  const stripNote = el('p', { class: 'note' });
  const facts = el('dl', { class: 'stats' });
  const marketSlot = el('div');
  const betStatus = el('p', { class: 'note bet-status', role: 'status' });
  const openList = el('ul', { class: 'entries' });
  const openEmpty = el('p', { class: 'note', text: 'Place a bet to see it here until its round closes.' });
  const doneList = el('ul', { class: 'entries' });
  const doneEmpty = el('p', { class: 'note', text: 'Settled bets appear here with the distance he really ran.' });

  root.append(
    el('div', { class: 'view-head' }, heading, clock),
    wheel,
    el(
      'div',
      { class: 'predict-grid' },
      el(
        'section',
        { class: 'predict-bet', 'aria-label': 'Place a bet' },
        marketSlot,
        betStatus,
      ),
      el(
        'section',
        { class: 'predict-form' },
        el('h2', { class: 'title', text: 'Form guide' }),
        facts,
        formSlot,
        formNote,
        stripSlot,
        stripNote,
      ),
    ),
    el('section', { class: 'band' }, el('h2', { class: 'title', text: 'Open bets' }), openEmpty, openList),
    el('section', { class: 'band' }, el('h2', { class: 'title', text: 'Settled bets' }), doneEmpty, doneList),
  );

  let pick = null;
  let stake = STAKES[1];
  let pickError = '';
  let marketKey = '';
  let formKey = '';

  function currentMarket() {
    const open = openRound();
    const rows = formRows(FORM_ROUNDS);
    const stats = roundStats();
    const line = overUnderLine(stats?.medianActiveWork, rows);
    const prices = marketPrices(rows, line);
    return { target: open === null ? null : open + 1, rows, line, prices };
  }

  function submit(event) {
    event.preventDefault();
    const market = currentMarket();
    if (!pick || !market.prices[pick]) {
      pick = null;
      pickError = 'Choose an outcome first.';
      marketKey = '';
      renderMarket();
      document.querySelector('input[name="pick"]:not(:disabled)')?.focus();
      return;
    }
    const mult = market.prices[pick];
    const line = OU_KINDS.includes(pick) ? market.line : null;
    const placed = placeBet({ kind: pick, round: market.target, stake, mult, line });
    if (!placed) {
      pickError = 'Choose a smaller stake, or run a race to earn more points.';
      marketKey = '';
      renderMarket();
      return;
    }
    betStatus.textContent = `Bet placed on round ${market.target}. It settles after the round closes.`;
    pick = null;
    pickError = '';
    marketKey = '';
    renderMarket();
  }

  function renderMarket() {
    const { target, line, prices } = currentMarket();
    const me = player();
    const placed = me.entries.filter((entry) => entry.round === target && entry.status === 'pending').map((entry) => entry.kind);
    const ouDone = placed.some((kind) => OU_KINDS.includes(kind));
    const srDone = placed.some((kind) => SR_KINDS.includes(kind));
    const affordable = STAKES.filter((value) => value <= me.points);
    if (affordable.length && me.points < stake) stake = affordable[affordable.length - 1];
    const phase = target === null ? live.phase : '';
    const key = JSON.stringify({ target, phase, line, prices, points: me.points, ouDone, srDone, pick, stake, pickError });
    if (key === marketKey) return;
    marketKey = key;

    const focusId = document.activeElement?.id;
    if (target === null) {
      replaceChildren(marketSlot, el('p', { class: 'note', text: live.phase === 'error' ? 'Unable to read the round from the API. Bets open again once it answers.' : 'Reading the round…' }));
      return;
    }
    if (prices.sample === 0) {
      replaceChildren(marketSlot, el('p', { class: 'note', text: 'Bets open once the API has reported a recent round.' }));
      return;
    }
    if ((pick && OU_KINDS.includes(pick) && ouDone) || (pick && SR_KINDS.includes(pick) && srDone)) pick = null;

    const onPick = (kind) => () => {
      pick = kind;
      pickError = '';
      renderMarket();
    };
    const ouFieldset =
      line === null
        ? el('p', { class: 'note', text: 'The distance line opens once a recent round has recorded wheel turns.' })
        : el(
            'fieldset',
            { class: 'market' },
            el('legend', { class: 'pick-legend', text: `Distance in round ${target}` }),
            pickRow({ kind: 'over', title: `Over ${line} m`, note: ouDone ? 'Already placed on this round' : 'He runs past the line', mult: prices.over, disabled: ouDone, checked: pick === 'over', onChange: onPick('over') }),
            pickRow({ kind: 'under', title: `Under ${line} m`, note: ouDone ? 'Already placed on this round' : 'He stops short of the line', mult: prices.under, disabled: ouDone, checked: pick === 'under', onChange: onPick('under') }),
          );
    const srFieldset = el(
      'fieldset',
      { class: 'market' },
      el('legend', { class: 'pick-legend', text: 'Sprint or rest' }),
      pickRow({ kind: 'sprint', title: 'Sprint', note: srDone ? 'Already placed on this round' : 'At least one wheel turn', mult: prices.sprint, disabled: srDone, checked: pick === 'sprint', onChange: onPick('sprint') }),
      pickRow({ kind: 'rest', title: 'Rest', note: srDone ? 'Already placed on this round' : 'No wheel turns at all', mult: prices.rest, disabled: srDone, checked: pick === 'rest', onChange: onPick('rest') }),
    );
    const stakeFieldset = el(
      'fieldset',
      { class: 'market' },
      el('legend', { class: 'pick-legend', text: `Stake, from ${fmtPoints(me.points)}` }),
      el(
        'div',
        { class: 'stakes' },
        ...STAKES.map((value) =>
          el(
            'label',
            { class: 'stake' },
            el('input', {
              type: 'radio',
              name: 'stake',
              id: `stake-${value}`,
              value: String(value),
              checked: stake === value,
              disabled: me.points < value,
              onchange: () => {
                stake = value;
                renderMarket();
              },
            }),
            el('span', { class: 'mono', text: String(value) }),
          ),
        ),
      ),
    );
    const canBet = me.points >= stake;
    const pays = pick && prices[pick] ? Math.round(stake * prices[pick]) : null;
    const error = el('p', { class: 'note field-error', id: 'bet-error', text: pickError });
    error.hidden = !pickError;
    const form = el(
      'form',
      { class: 'bet-form', onsubmit: submit, novalidate: true },
      ouFieldset,
      srFieldset,
      stakeFieldset,
      el('p', { class: 'note', text: `Pays reflect how often each outcome happened in the last ${prices.sample} reported rounds.` }),
      canBet ? null : el('p', { class: 'note field-error', text: `The smallest stake is ${fmtPoints(STAKES[0])}. Run a race to earn more.` }),
      error,
      el('button', {
        class: 'btn btn-primary',
        id: 'bet-submit',
        type: 'submit',
        disabled: !canBet,
        text: pays === null ? `Place ${stake} point bet` : `Place ${stake} point bet to win ${pays}`,
      }),
    );
    replaceChildren(marketSlot, form);
    if (focusId) document.getElementById(focusId)?.focus();
  }

  function renderForm() {
    const { rows, line } = currentMarket();
    const stats = roundStats();
    const cells = halfHourCells();
    const key = JSON.stringify({ rows: rows.map((row) => row.work), line, stats, cells: cells.length, busy: cells.map((cell) => cell.work).join(), failed: live.statsFailed });
    if (key === formKey) return;
    formKey = key;

    const known = rows.filter((row) => row.work !== null);
    const active = known.filter((row) => row.work > 0);
    const best = known.reduce((max, row) => Math.max(max, row.work), 0);
    const items = [];
    if (known.length) {
      items.push(['Active rounds', `${active.length} of ${known.length}`]);
      items.push(['Best recent round', fmtM(metresFromWork(best))]);
    }
    const medianWork = Number(stats?.medianActiveWork);
    const activeBps = Number(stats?.activeRateBps);
    if (Number.isFinite(medianWork)) items.push(['Median active, 7 days', fmtM((medianWork * MM_PER_WORK) / 1000)]);
    if (Number.isFinite(activeBps)) items.push(['Active rate, 7 days', `${(activeBps / 100).toFixed(1)}%`]);
    if (live.statsFailed) {
      items.push(['7-day form', 'Unavailable']);
    }
    replaceChildren(
      facts,
      ...items.map(([label, value]) =>
        el('div', { class: 'stat' }, el('dt', { class: 'label', text: label }), el('dd', { class: 'mono', text: value })),
      ),
    );
    if (rows.length) {
      const chart = roundChart(rows, metresFromWork);
      replaceChildren(formSlot, chart);
      formNote.textContent = `Last ${rows.length} rounds, newest on the right. One tile is up to ${chart.dataset.step} m. A dim tile is a still wheel, and an outline is not reported yet.`;
    } else {
      replaceChildren(formSlot);
      formNote.textContent = 'Reading recent rounds from the API…';
    }
    if (cells.length) {
      replaceChildren(stripSlot, halfHourChart(cells));
      stripNote.textContent = `Last ${cells.length} half hours, newest on the right. Bright tiles were his busiest.`;
    } else {
      replaceChildren(stripSlot);
      stripNote.textContent = live.statsFailed ? 'Half-hour history is unavailable right now.' : '';
    }
  }

  function renderEntries() {
    const bets = player().entries.filter((entry) => entry.kind !== 'race').reverse();
    const open = bets.filter((entry) => entry.status === 'pending');
    const done = bets.filter((entry) => entry.status !== 'pending').slice(0, 12);
    openEmpty.hidden = open.length > 0;
    doneEmpty.hidden = done.length > 0;
    replaceChildren(openList, ...open.map(entryRow));
    replaceChildren(doneList, ...done.map(entryRow));
  }

  const unsubscribe = subscribe(() => {
    renderEntries();
    renderMarket();
  });

  function update() {
    const open = openRound();
    if (open === null) {
      heading.textContent = 'Call the next round';
      clock.textContent = 'Round unknown';
    } else {
      heading.textContent = `Call round ${open + 1}`;
      clock.textContent = `Bets lock in ${fmtClock(roundEndMs(open, live.cfg) - nowMs())}`;
    }
    const work = openRoundWork();
    const soFar = work === null || open === null ? '' : ` Round ${open} so far: ${fmtM(metresFromWork(work))}.`;
    wheel.textContent = `${wheelLabel()}.${soFar}`.replace('….', '…');
    renderMarket();
    renderForm();
  }

  renderEntries();

  return {
    title: 'Predict a round · Squeek Wheel Arena',
    update,
    destroy() {
      unsubscribe();
    },
  };
}
