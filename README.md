# x3

A speedcubing timer inspired by csTimer — WCA scrambles, sessions, stats (mo3/ao5/ao12/ao100), a 3D cube, record celebrations, and a bunch of standalone experiment pages.

## Tech stack

- **Frontend:** vanilla HTML, CSS, and JavaScript (ES modules) — no framework
- **[cubing.js](https://js.cubing.net/cubing/)** — WCA random-state scrambles and the interactive 3D/2D cube viewer
- **[p5.js](https://p5js.org/)** — generative art galleries, data visualizations, and logo/celebration experiments
- **Backend:** Python + [FastAPI](https://fastapi.tiangolo.com/) (served by Uvicorn), SQLite for storage
- **Runtime:** Docker (Ubuntu 24.04), `docker compose`

## Run it

```sh
docker compose up -d --build
# → http://localhost:8080
```

Seed demo data (optional):

```sh
docker compose exec timer python3 -m app.seed
```

## Storage

Signed-out usage stores data locally in the browser; sign-in is optional and stores data server-side. Schema migrates automatically on startup; no extra runtime dependencies.
