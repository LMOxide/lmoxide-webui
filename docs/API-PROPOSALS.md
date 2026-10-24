# Proposed API changes

> **All seven items landed in lmoxide `bebf877`** ("API for the web UI: /v1/config, minifigure
> and token names, account totals, audit targets"), and the UI uses them. Each item below says
> how. The file is kept as a record. New proposals go under a new heading at the end.

Changes to `lmoxide-api` (in the [lmoxide](https://github.com/LMOxide/lmoxide) repo) that the web
UI would benefit from. Found while building the first version of the UI (2026-10-24). When one
lands, regenerate the types (`pnpm gen:api`) and update the UI as noted.

## 1. Playfield names come HTML-escaped (done)

`GET /v1/playfields` returns names such as `Natives&apos; Hollow`: the entities from the game
data aren't decoded. Decode them in the API (or when the data is loaded), so every client gets
plain text.

UI: nothing to change; the names display correctly once the API sends plain text.

**Done:** the API decodes them. The UI shows the names as given and decodes nothing itself.

## 2. Whether registration is open (done)

The UI can't tell whether `--open-registration` is on, so it always offers "Create an account"
and only learns otherwise from a 403 `registration_closed` on submit. Add
`registration_open: bool` to `GET /v1/status` (or a small public `GET /v1/config`).

UI: hide the "Create an account" button and the register link when it's false
(`src/pages/status.tsx`, `src/pages/login.tsx`, `src/pages/register.tsx`).

**Done:** public `GET /v1/config` has `registration_open`. `useConfig()` (`src/lib/queries.ts`)
reads it; the status and login pages hide the register links, and the register page says
registration is closed before you submit.

## 3. GM level thresholds (done)

`--moderator-gm-level` (default 1) and `--admin-gm-level` (default 2) are configurable, but the
UI can't see them. It assumes 1 = moderator and 2 = admin for role badges and the role picker.
Expose them, e.g. in the same config/status answer, or return a `role`/`scope` per account
alongside `gm_level`.

UI: `GmBadge` in `src/components/common.tsx` and `src/components/gm-level-select.tsx`.

**Done:** `GET /v1/config` has `moderator_gm_level` and `admin_gm_level`. `GmBadge` and
`GmLevelSelect` use them through `useGmLevels()`. A level above 0 but below the moderator level
shows as a plain "GM n" badge.

## 4. Username and password rules in the schema (done)

The server accepts usernames of 3-32 characters from `[A-Za-z0-9_.-]` and passwords of 8-128
characters (`lmoxide-db/src/accounts.rs`), but `openapi.json` doesn't say so. Add `pattern`,
`minLength`, `maxLength` to `Credentials`, `NewAccount`, `AccountChanges`, `ChangePassword`
and `SetPassword`. Likewise `maxLength: 500` on `BroadcastRequest.message`.

UI: `src/lib/rules.ts` mirrors these by hand for form hints; it could then be generated or at
least checked against the schema.

**Done:** the schema has the constraints. `pnpm gen:api` also runs `scripts/gen-rules.mjs`, which
writes `src/api/rules.gen.ts` from the schema and fails if the fields disagree. `src/lib/rules.ts`
re-exports it and keeps only the hint wording. The broadcast box uses
`BROADCAST_MIN`/`BROADCAST_MAX` from it.

## 5. Minifigure and token names (done)

`Character.team`, `Character.upgrades` and `Character.tokens` are bare ids. The names (and
ideally upgrade names per bit and an image reference) are in `data/minifigure_*.json` in the
lmoxide repo. A public, cacheable route such as `GET /v1/minifigures` (template id → name,
upgrades) and `GET /v1/tokens` (token id → name) would let the character page show names.

UI: `src/pages/character.tsx` shows raw ids today.

**Done:** public `GET /v1/minifigures` and `GET /v1/tokens` (cacheable for an hour) are fetched
once per hour (`useMinifigures()`, `useTokens()`). The character page shows minifigure names,
ranks, upgrade names by bit, and token names with their minifigure and location. It also shows the
new `level` and `xp`. **Not done:** images, because the API has no image reference yet.
`achievements` and `counters` aren't shown yet either.

## 6. Total count for account search (done)

`GET /v1/accounts` returns a page with no total, so the UI can only offer "next page" when a
page comes back full (and shows an empty next page when the total is a multiple of the page
size). Return a total, e.g. an `X-Total-Count` header or `{items, total}`.

UI: pagination in `src/pages/accounts.tsx`.

**Done:** `X-Total-Count` (exposed via CORS). The accounts page shows "x–y of total" and the page
number, and offers a next page only when there is one.

## 7. Consistent audit `target` (done)

`account-create` logs the username as `target`, but `account-ban`/`account-unban` log the
numeric account id. Use one form everywhere, ideally the username (it's what a human reads),
or both (`username (id)`), or add separate `target_id` / `target_name` fields so the UI can
link to the account.

UI: `src/pages/audit.tsx` could link targets to `/accounts/{id}`.

**Done:** `target` is the username for account actions, and the new `target_account_id` links it to
`/accounts/{id}` on the audit page. That page shows not found if the account has since been
deleted.
