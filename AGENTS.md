# AGENTS.md

## Project
`x3` — a speedcubing timer (csTimer-inspired) running in Docker (Ubuntu 24.04 + FastAPI + SQLite).

## Stack / architecture
- Backend: `app/` — FastAPI (routers in `app/routers/`, stats in `app/services/stats.py`), SQLite via stdlib at `/app/data/cubetimer.db` (WAL), persisted in the `timer-data` volume.
- Frontend: `app/static/` — `index.html`, `styles.css`, `app.js` (ES module). Scrambles: cubing.js CDN (`randomScrambleForEvent`) with a local fallback in `app.js`.
- Cube render: `<twisty-player>` needs the `https://cdn.cubing.net/v0/js/cubing/twisty` module script tag AND an explicit closing tag (custom elements can't self-close).
- Sticker colors: `player.stickers = { U, D, F, B, R, L }`; persisted in localStorage.
- 200 Linux-inspired themes in `app/static/themes.js` (`window.THEMES`); applied by setting CSS vars inline on `<html>`.

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
- Palette: steel face `#e7e9ec`, ink `#10121a`, accent `#1e6fd9`, ok `#1f7a48`, bad `#b23a2b`, brass `#a97c3f`. Fonts: Space Grotesk + Space Mono.
- Fixed-height app shell: `body { overflow: hidden }`, only the history list scrolls internally.
- Solves history is csTimer-style: single column of `# | time | ao5 | ao12` with rolling averages computed client-side (`buildRollups` in `app.js`).
