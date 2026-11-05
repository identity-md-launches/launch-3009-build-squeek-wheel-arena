# Validation record

**Completion: Incomplete.** The source and a static export are written, but nothing has been executed. Treat this as useful partial work, not a verified delivery.

## Why nothing ran

Every command and browser launch failed in this session, for the whole session, with these answers:

- Bash: `Sandbox is required but failed to initialize: Failed to create bridge sockets after 5 attempts. Restart to retry.` I retried this about ten times across the session, with the same result each time.
- Browser tool: `FATAL ... process_singleton_posix.cc:313] Socket path too long: .../.cache/tmp/org.chromium.Chromium.wAZktu/SingletonSocket`. Chromium aborted on launch.

The browser error points to the session's temporary directory path being too long for a Unix socket. The Bash failure may share that cause, but that is an inference. Changing the sandbox or temp path is the machine owner's decision, so it was not attempted. The Playwright tool's arbitrary-code runner was not used to spawn commands, because that would have stepped around the required sandbox.

File reading, file writing, search and web fetching worked. Everything below was produced with those alone.

## Scope and assumptions

Reviewed: home, race, predict and leaderboard, all from source. Inferred choices:

- **No Vite or React.** The default stack needs `npm install` and a build to produce any output. With no way to run them, plain ES modules were the only way to deliver a working export without a stand-in bundle or an invented lockfile. `package-lock.json` is a genuine lockfile for a package with no dependencies.
- **Other API endpoints.** The brief names `/v1/status`. It doesn't carry round genesis, history or form, so `/v1/core` and `/v1/measurement/stats` from the same public API supply those.
- **Local leaderboard.** See `README.md`.

## Checks

| Check | Result |
| --- | --- |
| Production build (`npm run build`) | **Not run.** `dist/` was written by hand with file tools |
| `dist/` matches `src/` (`npm run verify:dist`) | **Not run.** Written from a read-back of the final source. A search shows the same 16 files and the same line count for each (3,575 in total), but no byte comparison happened |
| Typecheck (`npm run typecheck`) | **Not run** |
| Unit tests (`npm test`) | **Not run.** `tests/` was written and traced by hand, so a test may fail when first run |
| Browser, console and resource checks | **Not run** |
| Interaction checks | **Not run** |
| Widths 320, 390, 1440 and first screen at 390 | **Not run.** Estimated from CSS only |
| `taste.mjs` probe | **Not run** |
| Keyboard walk, reduced motion, forced colours, zoom | **Not run** |
| Screen reader, physical device, WebKit | **Not run** |
| Size under 8 MiB | Not measured. The tree is text files only, about 200 KB by estimate |
| Git commit | **Not done.** Git needs a shell, so the files are uncommitted in the working tree |

What was done:

- **Live API inspection.** I read `/v1/status`, `/v1/core`, `/v1/settlements`, `/v1/measurement/stats` and `/v1/measurement/runs` through web fetch, and the API docs for field meanings. The response summaries came through a small model, not raw bytes, so field names are as it reported them. CORS comes from the docs and was not observed.
- **Hand trace.** I read all source for import and export mismatches, order-of-definition errors and logic faults.
- **Source searches.** `src/styles.css` has no `gradient`, `box-shadow`, `text-shadow`, `uppercase` or `transition: all`. Its only `letter-spacing` values are -0.02em at display sizes, and its only weights are 300, 400 and 600. `src/` has no em dashes or emoji, and no canvas gradient or `shadowBlur`. `Math.random` appears once, for player ids (`src/js/store.js:18`).

## Findings and fixes

All were found by reading source. None was reproduced in a browser, and none has been rechecked by running it.

| Severity | Location | Problem | Fix |
| --- | --- | --- | --- |
| High | `src/js/main.js` | The skip link's `#main` href would fire the hash router and unmount the current screen | The link now moves focus itself. The route lookup uses `Object.hasOwn` |
| High | `src/js/sim.js` | The widest pellet pile left about a 110 ms jump window | Smaller hitbox and a pile width tied to speed, giving about a third of a second, worked out by hand |
| High | `src/js/scene.js` | On a tall phone at top speed, only about 0.6 s of track was visible ahead | The scene keeps at least 560 world units in view, with extra height as open space above |
| High | `src/js/api.js` | A faster poll or a resume during a request could leave two polling chains running | The timer is cleared before it is set again |
| Medium | `src/js/api.js` | A failed `/v1/core` read marked a good wheel reading as an error | Core failures are handled apart from status failures |
| Medium | `src/js/view-predict.js` | The form guide showed "0.0 m" before any round was known, and the bet button could be disabled with no reason given | Those stats are hidden until known, the stake drops to what you can afford, and a note explains the rest |
| Medium | `src/js/store.js` | A first visit made a new player id on every read | The fresh state is now held in memory |
| Medium | `src/js/view-race.js`, `src/styles.css` | Panel text sat directly over the race art | The panel is now a solid surface |
| Medium | `src/js/view-home.js` | On short phones the main action could fall below the readout | The menu now comes before the readout under 60rem |
| Medium | `src/index.html` | The points link's `aria-label` didn't include its visible text | Label removed |
| Medium | `src/index.html`, `src/js/main.js` | The settled notice's live region started hidden, so announcements were unreliable | A separate, always-present region announces it |
| Low | `src/styles.css` | Table headers would render at weight 700, outside the three-weight set | Set to 600 |

## Better Interface coverage

All six domains were reviewed from source only. The guide's "with a browser" checks are unperformed throughout.

| Domain | Status | Inspected | Not verified |
| --- | --- | --- | --- |
| Accessibility | Checked (source) | Native buttons, links, radios and labels, one `h1` per view, skip link, `:focus-visible`, live regions, reduced-motion guards, inline errors, keyboard paths for the race | Tab order, visible focus, accessibility tree, automated audit, forced colours |
| Layout | Checked (source) | Logical properties, grouping, content-led breakpoints, DOM order against reading order, safe-area padding | Every rendered width, 200% zoom, RTL mirror |
| Writing | Checked (source) | Verb-first buttons, consistent terms, errors stating a fix, empty states pointing forward, sentence case | None. The guide says source is enough for this domain |
| Typography | Checked (source) | Six sizes, three rendered weights, tabular numbers, wrapping, measure caps, 16px inputs | Rendered wrapping and whether the fonts actually load |
| Colors | Checked (source) | Role tokens, one gold rule, status carried by words, three pairs computed by hand | Rendered contrast, including text over canvas |
| UI | Checked (source) | Named transition properties, `scale: 0.96`, flat surfaces, control states | Rendered states, motion at reduced speed |

Remaining limitation: the race itself can't be played with a screen reader or without precise timing. Predict is the fully accessible mode.

## Remaining limitations

- Nothing has been executed, so runtime errors may exist even after the hand trace.
- `src/index.html` loads fonts from Google Fonts, not bundled files.
- `og:image` is an SVG, not a PNG, so many link unfurlers won't show it.
- The race balance (speed, spacing, points against real round distances) is untested by any player.
- The early-result path from `builder.queued` couldn't be observed in a live closure window. It is guarded by a count check and falls back to settled events, which `tests/rounds.test.mjs` covers but has not run.
- The wheel was still throughout this session (`coreStatus` IDLE), so `ACTIVE` readings and non-zero speed were never seen.
