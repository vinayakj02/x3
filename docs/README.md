# x3 — local development

Everything you need to run x3 locally, seed demo data, and test Google sign-in.

## Run it

```sh
docker compose up -d --build
# → http://localhost:8080
```

Seed demo data (optional):

```sh
docker compose exec timer python3 -m app.seed
```

## Tests

```sh
docker compose exec timer python3 -m pytest tests
```

## Google sign-in (local)

Sign-in is optional and skipped unless credentials are provided.

1. In [Google Cloud Console](https://console.cloud.google.com) → **Credentials**, add a redirect URI:
   `http://localhost:8080/api/auth/callback`
2. Create a `.env` file (git-ignored):

   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

3. Start with the local override:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
   ```

Sign-in at `http://localhost:8080` will redirect to Google and back.

## Troubleshooting

- **Frontend changes don't show up** — static files are baked into the image; rebuild with `--build`, and bump the `?v=` cache-bust query params for `styles.css` / `app.js` when they change.
- **Google says redirect mismatch** — make sure the redirect URI above matches exactly and the consent screen includes your account as a test user.
