# AGENTS.md

## Project
`x3` — a speedcubing timer (csTimer-inspired) running in Docker (Ubuntu 24.04 + FastAPI + SQLite).

## Stack / architecture
- Backend: `app/` — FastAPI (routers in `app/routers/`, stats in `app/services/stats.py`), SQLite via stdlib at `/app/data/cubetimer.db` (WAL), persisted in the `timer-data` volume.
- Frontend: `app/static/` — `index.html`, `styles.css`, `app.js` (ES module). Scrambles: cubing.js CDN (`randomScrambleForEvent`) with a local fallback in `app.js`.
- Cube render: `<twisty-player>` needs the `https://cdn.cubing.net/v0/js/cubing/twisty` module script tag AND an explicit closing tag (custom elements can't self-close).
- Sticker colors: `player.stickers = { U, D, F, B, R, L }`; persisted in localStorage.
- 5 themes total: system `Paper White` / `x3 · Dark` (in `app.js`) + 3 in `app/static/themes.js` (`window.THEMES`: Star Wars, Alien, The Matrix); applied by setting CSS vars inline on `<html>`. No search box in the theme picker, no glow on numbers.
- Theme essence mechanism: entries may carry `fontDisplay`/`fontMono` + `fontUrl` (auto-loaded `<link id="theme-font">`) and `vars` (custom props applied/removed per theme); `applyTheme` sets `root.dataset.themeId` for scoped extras. SW: starfield instrument, gold best-solves, notched cards. Alien: scanlines + blinking block cursor. Paper White: `--radius: 10px`, binding-margin rule. Empty history: 5 ghost rows.

## Docker
- Build/run: `docker compose up -d --build` → app at http://localhost:8080 (host 8080 → container 8000; 8000 is taken by Docker Desktop).
- Tests inside container: `docker compose exec timer python3 -m pytest tests` (6 tests in `tests/test_stats.py`).
- Seed demo data: `docker compose exec timer python3 -m app.seed` (`--no-fresh` to append).

## Workflow preferences
- **Standalone pages** (e.g. visualizations, theme galleries, any self-contained HTML in `app/static/`) should be built by **parallel subagents** while the main thread continues on the app. They don't need integration into the main page unless asked.
- Frontend changes need an image rebuild to take effect (static files are copied into the image via `COPY app ./app`).
- Bump `?v=` query params on `styles.css` / `app.js` in `index.html` when they change, to bust client cache.
- Verify UI with headless Chrome (SwiftShader for WebGL) via CDP + Node when possible.

## UI
- Palette (Paper White light): cream `#f4efe3`, panel `#e8e2d1`, espresso ink `#2b251c`, bronze accent `#7c5a2e`, ok `#4a6b3f`, bad `#a83a32`, brass `#8a7a1e` (ref: notebook grid photo). Warm-gray grid via `:root[data-theme="light"]` `--gridline`/`--gridcross` (scoped so custom dark themes fall back to their own hair). Binding-margin double rule on history, 2px topbar rule. Serif display stack on light via per-theme `fontDisplay` in `app.js`.
- Celebration ships fly ~4x slower and larger (`celebrate.js`); SW/Alien burst colors match new palettes.
- Spacing tokens: `--gutter: 1.5rem` (outer), `--gap: 1.5rem` (column/row), `--inset: 1rem` (card inset), `--stack: 0.5rem` (inner stacks); smaller values at breakpoints.
- Instrument grid: full box grid, no center cross (it sliced through the readout).
- Chrome is accent-free everywhere (brand, stat titles/rules, session/sync/record labels use ink-soft/hair); accent reserved for interactive + running + semantic best states.
- Background images: hotlink URL + dim slider in settings (`?bg=` preview), localStorage-only (`x3.bgUrl`, `x3.bgDim`); `.bg-veil` keeps text readable.
- Fixed-height app shell: `body { overflow: hidden }`, only the history list scrolls internally.
- Solves history is csTimer-style: single column of `# | time | ao5 | ao12` with rolling averages computed client-side (`buildRollups` in `app.js`).
