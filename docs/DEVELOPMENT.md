# Development

[← README](../README.md)

## Running locally

```sh
# in ../lmoxide: an API on 127.0.0.1:8090 with its own database and demo accounts
tools/web-dev-backend.sh     # --reset for a fresh database

# here
pnpm install
pnpm dev                     # http://localhost:5173
```

The dev server proxies `/api/*` to `http://127.0.0.1:8090` (stripping `/api`), the same layout
as production behind a reverse proxy. Point it elsewhere with
`LMOXIDE_API=http://host:port pnpm dev`.

| Login | Password | Sees |
|---|---|---|
| `admin` | `admin-password` | everything (GM level 2) |
| `moderator` | `moderator-password` | moderation (GM level 1) |
| `player` | `player-password` | only their own account |
| `banned` | `banned-password` | banned for 7 days |

The backend also prints two API keys for bots: `demo-bot` (read) and `demo-mod-bot` (moderate).

## Scripts

| Script | |
|---|---|
| `pnpm dev` | dev server with hot reload |
| `pnpm gen:api` | regenerate `src/api/schema.d.ts` and `src/api/rules.gen.ts` from `../lmoxide/docs/openapi.json` after an API change |
| `pnpm typecheck` | `tsc -b` |
| `pnpm lint` | oxlint |
| `pnpm build` | typecheck, then static files in `dist/` |
| `pnpm preview` | serve `dist/` locally |

## Layout

| Path | |
|---|---|
| `src/api/client.ts` | the typed client, `ApiError`, bearer token, `unwrap()` |
| `src/api/schema.d.ts`, `rules.gen.ts` | generated from the OpenAPI schema; don't edit |
| `src/lib/auth.tsx`, `auth-context.ts` | the login session (in `sessionStorage`) and scope checks; a 401 `unauthorized` anywhere logs out |
| `src/lib/rules.ts` | username/password/broadcast limits for form hints, from `rules.gen.ts` |
| `src/lib/queries.ts`, `format.ts` | shared queries; date, number and name formatting |
| `src/pages/` | one file per route (see `src/App.tsx`) |
| `src/components/` | shared pieces: layout, moderation dialogs, tables, the route guard (`require.tsx`) |
| `src/components/ui/` | shadcn components |

## Changing the API

The API lives in the lmoxide repo; if the UI needs something it lacks, change it there rather
than working around it here, and note it in [`API-PROPOSALS.md`](API-PROPOSALS.md). After the
change, run `pnpm gen:api` and fix whatever `pnpm typecheck` reports.

<details>
<summary>Gotchas</summary>

- The Vite proxy key must be `^/api/`: a plain `/api` also catches the `/api-keys` page.
- The shadcn CLI once rewrote `cn` imports to an npm package called `cn`. Check imports after
  adding a component.

</details>

## Screenshots in the docs

The images in `docs/screenshots/` are 1280-wide dark-mode captures from headless Chromium, taken
against a scratch database filled with mock accounts, characters and moderation actions.
