# Squeek Wheel Arena design

Read this before adding a page. Values come from the source. Nothing here has been confirmed in a browser yet, because no browser could run when the site was built: see `VALIDATION.md`.

## Overview

A game site for people following Squeektoshi, a real hamster on a live wheel. The chrome is quiet and flat: a near-black page, graphite surfaces and hairline borders. Two things are allowed to be bright. One is the race scene, drawn on a canvas. The other is the live hamster readout, whose distance figure is the only gold text on the site.

The one visual idea is the tile. A blue square stands for wheel activity everywhere: the wordmark glyph, the favicon, the studs on the wheel, the race floor, the round chart, the half-hour strip and the streak badges.

System-wide rules: sentence case, no gradients, no glows, no shadows, no gradient text, no emoji as icons, no uppercase or wide-tracked labels, no endless decorative motion. The home wheel moves only when the API reports his wheel turning.

## Colors

Tokens live in `src/styles.css` under `:root`, in hex.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#1a1a20` | Page background |
| `--color-surface` | `#23232a` | Panels, quiet buttons, fields, pick rows |
| `--color-surface-raised` | `#2c2c34` | Hover and selected surfaces, skip link |
| `--color-line` | `#3a3a44` | Hairline borders and dividers |
| `--color-text` | `#f2f2f4` | Primary text, selected borders |
| `--color-text-muted` | `#b4b4bf` | Secondary text, labels, notes |
| `--color-accent` | `#f2c230` | Gold: the one primary action per view and the live distance figure, nothing else |
| `--color-on-accent` | `#1a1a20` | Text on gold |
| `--color-tile` | `#5b7cfa` | Blue tile glyphs. Never used for text |
| `--color-tile-low` | `#34447f` | Quieter half-hour tiles |
| `--color-tile-still` | `#3a3a44` | A round where the wheel stayed still |
| `--color-focus` | `#f2f2f4` | Focus ring |
| `--color-arena` | `#1f2231` | Stage background behind the race canvas |

`.btn-primary:hover` uses a literal `#f6cf55`, the one colour outside the tokens.

Canvas art has its own palette in `ART` (`src/js/hamster.js`): hamster fur, patch, cheek and ear, pellets, ramp, floor tiles and the ghost. It applies only inside canvas scenes.

There are no win or loss colours. Outcomes are words ("Won", "Lost", "Push", "Walkover", "Void"), and a win also gets an underline.

Contrast below was computed by hand from the token values and has not been measured on rendered pixels:

| Foreground | Background | Ratio |
| --- | --- | --- |
| `--color-text-muted` | `--color-bg` | about 8.4:1 |
| `--color-text-muted` | `--color-surface` | about 7.6:1 |
| `--color-accent` | `--color-bg` | about 10.3:1 |

## Typography

The fonts load from Google Fonts in `src/index.html`, not from local files. See the limitation in `VALIDATION.md`. The stack in `src/styles.css` falls back to narrow, monospace and humanist system faces.

| Role | Class | Font | Weight | Size token | Line height |
| --- | --- | --- | --- | --- | --- |
| Hero headline | `.display` | Barlow Condensed | 300 | `--fs-display` `clamp(3rem, 2rem + 5vw, 6rem)` | 1, tracking -0.02em |
| Section and view titles | `.title` | Barlow Condensed | 600 | `--fs-title` 1.75rem | 1.1 |
| Prose | body, `.lede` | Barlow Condensed | 300 | `--fs-prose` 1.25rem | 1.4 |
| Labels | `.label` | Quicksand | 600 | `--fs-label` 0.875rem | 1.3 |
| Short supporting text | `.note` | Quicksand | 600 | `--fs-label` 0.875rem | 1.45 |
| Buttons | `.btn` | Quicksand | 600 | `--fs-body` 1rem | 1.2 |
| Numbers and readouts | `.mono` | IBM Plex Mono | 400 | `--fs-body` 1rem | inherited |
| Live distance | `.figure` | IBM Plex Mono | 400 | `--fs-figure` `clamp(2.5rem, 1.9rem + 2.8vw, 4rem)` | 1.05, tracking -0.02em |

That is six sizes and three rendered weights (300, 400, 600). Barlow Condensed 200 is requested with the family, as the brief lists it, but no rule uses it. A fourth rendered weight would break the three-weight review bar.

All live numbers use `font-variant-numeric: tabular-nums`. Headings use `text-wrap: balance`, and `.lede` and `.note` use `text-wrap: pretty`. Prose stays at 20px so its light weight remains readable.

## Layout

Spacing tokens step 4, 8, 16, 24, 32 and 48px (`--space-1` to `--space-6`). Content sits in a centred column up to `--page-max` (70rem), with `--page-margin` of 16px, rising to 24px at 40rem.

| Width | Behaviour |
| --- | --- |
| Under 40rem | One column. Home order is headline, mode menu, then readout, so the main action comes first. The race stage bleeds to the screen edges |
| 40rem and up | Mode menu becomes two columns, the race stage is inset with a radius, and the home wheel grows to 9.5rem |
| 60rem and up | Home hero becomes two columns, with copy and menu on the left and the readout on the right. Predict puts bet and form guide side by side |
| Height under 30rem, landscape | Race stage drops to `62vh` so track and pads stay on one screen |

The race scene keeps at least 560 world units of track in view. On a tall, narrow stage the floor stays at the bottom and the extra height becomes open space above it (`MIN_VIEW_W` in `src/js/scene.js`).

The board table scrolls inside `.table-wrap`. Everything else wraps.

Widths and breakpoints above come from the source. None has been observed in a browser.

## Elevation and depth

Flat. No shadows anywhere. Depth comes from the tonal step between `--color-bg`, `--color-surface` and `--color-surface-raised`, plus a 1px `--color-line` border. The race panel (`.stage-panel`) overlays the canvas as a solid surface so its text never sits on the art.

## Shapes

`--radius-control` (4px) for buttons, fields, picks and stakes. `--radius-panel` (8px) for the readout, stage and stage panel. SVG tiles use a 1px corner. Icons are not used, apart from the wordmark's tile glyph.

## Components

| Component | Source | Notes |
| --- | --- | --- |
| Buttons | `.btn`, `.btn-primary`, `.btn-quiet` in `src/styles.css` | One `.btn-primary` per view. Minimum height 48px, `scale: 0.96` on press unless reduced motion is on. Disabled state is a neutral surface with muted text |
| Mode link | `.mode` in `src/js/view-home.js` | A link styled as a two-line button |
| Live readout | `.readout` in `src/js/view-home.js` | Status line, gold figure, wheel canvas, stat list. Unknown values say "Unknown", never zero |
| Stat list | `.stats`, `.stat` | A `dl` that fits its columns automatically |
| Tile chart | `roundChart`, `halfHourChart`, `badgeGlyph` in `src/js/ui.js` | SVG with `role="img"` and a written summary in `aria-label`. States are `tile-on`, `tile-low`, `tile-still` and `tile-unknown` |
| Entry row | `entryRow` in `src/js/ui.js` | One race or bet: outcome word, name and detail |
| Pick row and stake | `pickRow` in `src/js/view-predict.js`, `.pick`, `.stake` | Native radios inside labels. The selected state changes the border and surface, and the radio itself shows it too |
| Race stage | `src/js/view-race.js`, `src/js/scene.js`, `src/js/sim.js` | Canvas, overlay panel and jump and slide pads. Keyboard: Space, up arrow or W to jump, down arrow or S to slide, Esc or P to pause |
| Settled notice | `#notice` in `src/index.html`, set in `src/js/main.js` | Stays until dismissed. A separate `#notice-live` region announces it |
| Fields | `.field`, `.field-row`, `.code-field` | 16px text, with visible labels and inline errors linked by `aria-describedby` |

## Do's and don'ts

- Do reach for a token. If a role has none, add one.
- Do keep gold to one filled action per view and the live distance figure.
- Do write "Unknown" or "not reported yet" when the API has not given a value. Squeekchain's docs say an unavailable value is unknown, not zero.
- Do settle anything that awards points through `settleEntry` in `src/js/rounds.js`, so outcomes stay tied to a real round.
- Don't add a colour for win or loss. Use a word.
- Don't add a tracked or uppercase label, a shadow or a glow.
- Don't animate anything that isn't reporting real activity or responding to the player.

To add a page: export a `mountX(root)` function that returns `{ title, update, destroy }`, register it in `routes` in `src/js/main.js`, open with `.view-head` and a `.title`, group sections with `.band`, and use `.stats`, `.entries` and `.btn-quiet`. Rebuild with `npm run build`.
