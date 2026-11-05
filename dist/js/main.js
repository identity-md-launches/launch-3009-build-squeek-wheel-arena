import { live, nowMs, onLive, startPolling } from './api.js';
import { roundEndMs, workOfRound } from './rounds.js';
import { player, settlePending, subscribe } from './store.js';
import { fmtPoints, summaryOf } from './ui.js';
import { mountBoard } from './view-board.js';
import { mountHome } from './view-home.js';
import { mountPredict } from './view-predict.js';
import { mountRace } from './view-race.js';

const routes = { race: mountRace, predict: mountPredict, board: mountBoard };
// Long enough that a round's settlement event has reached /v1/core before giving up on it.
const VOID_AFTER_MS = 20 * 60 * 1000;

const main = document.getElementById('main');
const pointsLink = document.getElementById('header-points');
const notice = document.getElementById('notice');
const noticeText = document.getElementById('notice-text');
const noticeLive = document.getElementById('notice-live');
const noticeClose = document.getElementById('notice-close');

let view = null;
let firstRoute = true;

function route() {
  view?.destroy?.();
  main.replaceChildren();
  const key = location.hash.replace(/^#\/?/, '');
  const mount = Object.hasOwn(routes, key) ? routes[key] : mountHome;
  view = mount(main);
  document.title = view.title;
  view.update?.();
  window.scrollTo(0, 0);
  if (!firstRoute) main.focus({ preventScroll: true });
  firstRoute = false;
}

function showHeader() {
  pointsLink.textContent = fmtPoints(player().points);
}

function resolve(entry) {
  const work = workOfRound(live.cum, entry.round);
  if (work !== null) return { work };
  if (!live.cfg || live.coreSettled === null || entry.round > live.coreSettled) return null;
  if (nowMs() - roundEndMs(entry.round, live.cfg) < VOID_AFTER_MS) return null;
  return { void: true };
}

function settleAll() {
  if (!live.cfg) return;
  const settled = settlePending(resolve, (round) => roundEndMs(round, live.cfg));
  if (!settled.length) return;
  const message = settled.length === 1
    ? summaryOf(settled[0])
    : `${settled.length} outcomes settled. Your balance is ${fmtPoints(player().points)}.`;
  noticeText.textContent = message;
  noticeLive.textContent = message;
  notice.hidden = false;
}

noticeClose.addEventListener('click', () => {
  notice.hidden = true;
  noticeText.textContent = '';
});

// The hash belongs to the router, so the skip link moves focus itself.
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  main.focus();
});

window.addEventListener('hashchange', route);
subscribe(showHeader);
onLive(() => {
  settleAll();
  view?.update?.();
});
setInterval(() => view?.update?.(), 1000);

showHeader();
route();
startPolling();
