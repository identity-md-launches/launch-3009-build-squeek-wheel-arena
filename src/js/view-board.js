import { nowMs } from './api.js';
import { BADGES } from './rounds.js';
import {
  addPlayer,
  bestStreakOf,
  importScoreCode,
  leaderboard,
  makeScoreCode,
  player,
  players,
  removeImported,
  renamePlayer,
  storageAvailable,
  streakOf,
  subscribe,
  switchPlayer,
} from './store.js';
import { badgeGlyph, el, replaceChildren } from './ui.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function mountBoard(root) {
  const tableBody = el('tbody');
  const storageNote = el('p', { class: 'note' });
  const streakLine = el('p', { class: 'mono' });
  const badgeList = el('ul', { class: 'badges' });
  const nameInput = el('input', { id: 'player-name', class: 'field', type: 'text', maxlength: '24', autocomplete: 'nickname', spellcheck: 'false' });
  const nameError = el('p', { class: 'note field-error', id: 'name-error', hidden: true });
  const switchSelect = el('select', { id: 'player-switch', class: 'field' });
  const switchRow = el(
    'div',
    { class: 'field-row' },
    el('label', { class: 'label', for: 'player-switch', text: 'Switch player' }),
    switchSelect,
  );
  const codeOutput = el('textarea', { id: 'my-code', class: 'field code-field', rows: '3', readonly: true, hidden: true, 'aria-label': 'Your score code' });
  const copyStatus = el('p', { class: 'note', role: 'status' });
  const codeInput = el('textarea', { id: 'friend-code', class: 'field code-field', rows: '3', spellcheck: 'false', 'aria-describedby': 'code-error' });
  const codeError = el('p', { class: 'note field-error', id: 'code-error', hidden: true });
  const addedStatus = el('p', { class: 'note', role: 'status' });

  function saveName(event) {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameError.textContent = 'Enter a name with at least one character.';
      nameError.hidden = false;
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.setAttribute('aria-describedby', 'name-error');
      nameInput.focus();
      return;
    }
    nameError.hidden = true;
    nameInput.removeAttribute('aria-invalid');
    nameInput.removeAttribute('aria-describedby');
    renamePlayer(name);
  }

  function newPlayer() {
    addPlayer(`Player ${players().length + 1}`);
    nameInput.focus();
    nameInput.select();
  }

  async function copyCode() {
    const code = makeScoreCode(player(), nowMs());
    codeOutput.value = code;
    codeOutput.hidden = false;
    try {
      await navigator.clipboard.writeText(code);
      copyStatus.textContent = 'Score code copied. Send it to a friend to add to their board.';
    } catch {
      codeOutput.focus();
      codeOutput.select();
      copyStatus.textContent = 'Unable to reach the clipboard. Select the code above and copy it yourself.';
    }
  }

  function addCode(event) {
    event.preventDefault();
    const error = importScoreCode(codeInput.value);
    if (error) {
      codeError.textContent = error;
      codeError.hidden = false;
      codeInput.setAttribute('aria-invalid', 'true');
      codeInput.focus();
      addedStatus.textContent = '';
      return;
    }
    codeError.hidden = true;
    codeInput.removeAttribute('aria-invalid');
    codeInput.value = '';
    addedStatus.textContent = 'Score added to the board.';
  }

  switchSelect.addEventListener('change', () => switchPlayer(switchSelect.value));

  root.append(
    el('div', { class: 'view-head' }, el('h1', { class: 'title', text: 'Leaderboard' })),
    storageNote,
    el(
      'div',
      { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Leaderboard table' },
      el(
        'table',
        { class: 'board' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { scope: 'col', class: 'num', text: 'Rank' }),
            el('th', { scope: 'col', text: 'Player' }),
            el('th', { scope: 'col', class: 'num', text: 'Points' }),
            el('th', { scope: 'col', class: 'num', text: 'Wins' }),
            el('th', { scope: 'col', class: 'num', text: 'Week streak' }),
            el('th', { scope: 'col', text: 'Source' }),
          ),
        ),
        tableBody,
      ),
    ),
    el(
      'section',
      { class: 'band' },
      el('h2', { class: 'title', text: 'Weekly streak badges' }),
      streakLine,
      el('p', { class: 'note', text: 'A week counts once you win a settled race or bet between Monday and Sunday UTC.' }),
      badgeList,
    ),
    el(
      'section',
      { class: 'band' },
      el('h2', { class: 'title', text: 'Player' }),
      el(
        'form',
        { class: 'inline-form', onsubmit: saveName, novalidate: true },
        el('div', { class: 'field-row' }, el('label', { class: 'label', for: 'player-name', text: 'Name' }), nameInput),
        el('button', { class: 'btn btn-quiet', type: 'submit', text: 'Save name' }),
      ),
      nameError,
      switchRow,
      el('button', { class: 'btn btn-quiet', type: 'button', text: 'Add a player', onclick: newPlayer }),
    ),
    el(
      'section',
      { class: 'band' },
      el('h2', { class: 'title', text: 'Compare with friends' }),
      el('p', { class: 'note', text: 'Each browser keeps its own scores. A score code carries yours to someone else’s board, as you report it. Nothing checks it against the rounds.' }),
      el('button', { class: 'btn btn-quiet', type: 'button', text: 'Copy my score code', onclick: copyCode }),
      codeOutput,
      copyStatus,
      el(
        'form',
        { class: 'stack-form', onsubmit: addCode, novalidate: true },
        el('label', { class: 'label', for: 'friend-code', text: 'Friend’s score code' }),
        codeInput,
        codeError,
        el('button', { class: 'btn btn-quiet', type: 'submit', text: 'Add score' }),
        addedStatus,
      ),
    ),
  );

  function render() {
    const now = nowMs();
    const me = player();
    replaceChildren(
      tableBody,
      ...leaderboard(now).map((row, index) =>
        el(
          'tr',
          { class: row.active ? 'is-me' : null },
          el('td', { class: 'mono num', text: String(index + 1) }),
          el('th', { scope: 'row', class: 'board-name', text: row.name }),
          el('td', { class: 'mono num', text: row.points.toLocaleString('en-US') }),
          el('td', { class: 'mono num', text: String(row.wins) }),
          el('td', { class: 'mono num', text: String(row.streak) }),
          el(
            'td',
            { class: 'note board-source' },
            row.source,
            row.imported
              ? el('button', {
                  class: 'link-button',
                  type: 'button',
                  text: `Remove ${row.name}`,
                  onclick: () => removeImported(row.id),
                })
              : null,
          ),
        ),
      ),
    );
    storageNote.textContent = storageAvailable()
      ? 'Scores are saved in this browser and sent nowhere. This board ranks the players on this browser and any score codes you add.'
      : 'This browser is blocking storage, so scores last only until you close the tab.';

    const streak = streakOf(me, now);
    const best = bestStreakOf(me);
    streakLine.textContent = `${me.name}: ${plural(streak, 'week')} now, ${plural(best, 'week')} at best`;
    replaceChildren(
      badgeList,
      ...BADGES.map((badge) => {
        const earned = best >= badge.weeks;
        return el(
          'li',
          { class: `badge${earned ? ' is-earned' : ''}` },
          badgeGlyph(badge.weeks, earned),
          el('span', { class: 'badge-name', text: badge.name }),
          el('span', { class: 'note', text: earned ? 'Earned' : `${plural(badge.weeks, 'week')} in a row` }),
        );
      }),
    );

    if (document.activeElement !== nameInput) nameInput.value = me.name;
    const all = players();
    switchRow.hidden = all.length < 2;
    replaceChildren(
      switchSelect,
      ...all.map((p) => el('option', { value: p.id, selected: p.id === me.id, text: p.name })),
    );
  }

  const unsubscribe = subscribe(render);
  render();

  return {
    title: 'Leaderboard · Squeek Wheel Arena',
    destroy() {
      unsubscribe();
    },
  };
}
