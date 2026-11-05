# Squeek Wheel Arena

A real-time hamster racing and prediction game on Squeekchain's live data. It has two modes and one shared hamster: race a ghost that runs at Squeektoshi's real speed, or bet on his next round. Every outcome settles against the real round the API reports.

> **Status: this build has never been run.** The machine it was written on could not start a shell or a browser, so no build, typecheck, test or browser check has been carried out. `dist/` was written by hand as a copy of `src/`. Run the steps under "Finish verification" before relying on it. Details are in [`VALIDATION.md`](VALIDATION.md).

## Install, preview and rebuild

The site is plain ES modules with no dependencies, so `npm install` has nothing to fetch. You need Node 20 or later.

```sh
npm run build     # copies src/ to dist/
npm run preview   # serves dist/ at http://localhost:4173/preview/
```

`dist/` is the static export. Host it anywhere: all its asset URLs are relative and routing uses the URL hash, so it works from a subpath or a gateway. To edit the site, change `src/` and rebuild.

## Finish verification

```sh
npm run verify:dist   # dist/ must match src/ byte for byte
npm test              # settlement rules and the race simulation
npm run typecheck     # needs the network, fetches TypeScript through npx
npm run preview       # then play it at 390 and 1440 wide
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

## How the data works

The site reads Squeekchain's public API from the browser. It needs no key, wallet or login, and the docs state `Access-Control-Allow-Origin: *`.

| Endpoint | Used for |
| --- | --- |
| `/v1/status` | Live distance, speed, rpm and wheel state, plus round closures. Polled every 5 s, or every 2 s in a race |
| `/v1/core` | Genesis time, round length and the last 25 `BatchSettled` events. Read every 60 s |
| `/v1/measurement/stats?range=7d` | 7-day median active round, active rate and half-hour history. Read once an hour |

**Rounds.** Round N ends at genesis + N × 600 seconds. The API has no per-round endpoint, so a round's work is the difference in cumulative work between rounds N and N−1. Those figures come from:

- `builder.anchor` for settled rounds
- `builder.anchor` plus `builder.queued.closedWorkUnits` for rounds the oracle has closed but the chain has not settled
- `BatchSettled` events for recent history

**Distance.** Work converts at 878 mm per turn. That rate isn't published as a constant. It comes from the API's own lifetime totals: 3,351,326 mm over 3,817 turns is exactly 878.

**Unknown is never zero.** A round the API has not reported stays open. If it can't be worked out once the chain has settled it, and 20 minutes have passed since it closed, a bet is voided and its stake returned. A void race pays nothing.

## Rules

- **Race.** The metres you run during a round count towards that round. When it closes you earn your metres (up to 300) plus 100 if you beat his distance. If you don't, or if his wheel stayed still, you earn half your metres.
- **Predict.** Bets lock when the next round starts. Over or under compares his distance with a line taken from the 7-day median active round. Sprint means at least one wheel turn, and rest means none. Pays come from how often each outcome happened in the last 24 reported rounds and are shown before you bet.
- **Points.** Everyone starts with 500. Races and bets share one balance.
- **Streaks.** A week counts once you win a settled race or bet between Monday and Sunday UTC. Badges mark 1, 2, 4, 8 and 12 weeks in a row.

Race courses are generated from a seed, so the obstacles vary, but randomness never decides who wins or what pays.

## Leaderboard

Points and the leaderboard live in the browser's `localStorage`, and nothing is sent anywhere. A static export has no server, so this is the simplest thing that can't break, and the board says so plainly. It ranks the players on one browser, plus any friends whose score codes you paste in.

Score codes are self-reported: nothing checks them against the rounds, and a checksum only catches typos. A shared leaderboard that can't be edited by players would need a server, which this site doesn't have.

## Project layout

```
src/index.html      Entry page and share metadata
src/styles.css      Design tokens and components
src/js/rounds.js    Round, market and settlement rules (pure)
src/js/sim.js       Race simulation (pure)
src/js/api.js       API polling and live state
src/js/store.js     Points, entries, leaderboard, score codes
src/js/scene.js     Race drawing
src/js/hamster.js   Hamster and wheel art
src/js/ui.js        DOM helpers, charts, entry rows
src/js/view-*.js    The four screens
src/js/main.js      Router and settlement loop
scripts/            Build, verify and preview
tests/              Node tests for the rules and the simulation
dist/               Static export
```

Design documentation is in [`DESIGN.md`](DESIGN.md).

## Known limitations

- Nothing has been run. See the status note above.
- Fonts load from Google Fonts because font files couldn't be downloaded here. Offline, or with that host blocked, the site falls back to system fonts.
- `og:image` is an SVG, because a PNG couldn't be produced here. Many link unfurlers don't render SVG, so share cards may show no image until `og-image.svg` is exported to PNG and the tag is updated.
- `builder.queued` isn't fully documented. The early result from it is used only when its round count exactly matches the oracle's closure. Otherwise a round settles from the chain, about five and a half minutes after it closes.
- A bet whose round leaves the API's 25-event window before you return is voided and refunded, because the API can no longer show that round's result.
