# Production readiness audit — `kisholoy`

Date: 2026-09-10 · Branch: `arena/01a08acd-kisholoy` · Base: `dbd8f697`

> **Read this section first.** The work request described a bespoke
> "Kisholoy" e-commerce application (storefront + admin + checkout + seeded
> catalog) deployed on Vercel. **That application is not in this repository.**
> Everything below is what this repository actually contains, what could be
> verified, what was fixed, and what is still open. Claims that could not be
> verified are marked **NOT VERIFIED**.

---

## 1. What this repository actually is

| Check                   | Command                                            | Result                                                                                               |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Remote                  | `git remote -v`                                    | `https://github.com/md-muntasir-shihab/kisholoy.git`                                                 |
| Description             | `gh repo view md-muntasir-shihab/kisholoy`         | "The world's most flexible commerce platform."                                                       |
| Size of history         | `git show --stat dbd8f697`                         | 22,869 files, 4,978,550 insertions, **one** squashed commit                                          |
| Content                 | `grep -ril "kisholoy" . --exclude-dir=.git`        | **no matches**                                                                                       |
| Storefront              | `find . -name "next.config*" -not -path "./www/*"` | **none**                                                                                             |
| Seed data               | `find . -name "*seed*"`                            | only `integration-tests/helpers/*-seeder.js.txt` (legacy v1 fixtures, disabled by the `.txt` suffix) |
| Environment files       | `find . -name ".env*"`                             | only upstream doc/CI samples under `www/` and `integration-tests/.env.test`                          |
| Database available here | `which psql postgres pg_ctl`                       | **not installed**                                                                                    |

This is a **fork of the `medusajs/medusa` monorepo** (the open-source commerce
framework), not an application. It ships:

- `packages/medusa` + `packages/core/framework` — the Node HTTP server, router,
  auth middleware, config loader, CLI (`medusa user`, `medusa exec`, `medusa db:*`).
- `packages/modules/*` — commerce modules (product, cart, order, inventory,
  promotion, payment, auth, …).
- `packages/admin/dashboard` — the React admin SPA (the only Vercel-deployable
  artifact here; `packages/admin/dashboard/vercel.json` is the upstream SPA
  rewrite rule).
- `www/` — documentation sites.

The only local commits on top of upstream `v2.17.1`:

1. `dbd8f697` — admin sidebar grouping + badges + i18n keys (this branch).
2. `68b3647d` on the **sibling** branch `arena/01a086ef-kisholoy` — an earlier
   security pass that was **never merged into `develop`** (verified with
   `gh api repos/md-muntasir-shihab/kisholoy/commits?sha=arena/01a086ef-kisholoy`).

Consequence: requests that presuppose an app — "orders are not created",
"checkout fails", "seed 20 demo products", "test the customer journey at
320px" — have no code path in this repository to act on. They need the
application repository (the Medusa app + storefront) or a running instance.

---

## 2. The reported security problems, checked against the code

### "Admin can be accessed insecurely / admin credentials are exposed"

**Not reproducible in this repository.** Evidence:

- No hardcoded credentials. `grep -rn "admin@medusa\|superadmin\|password: \"\""
packages/admin/dashboard/src` returns only empty form defaults
  (`routes/login/login.tsx:40`, `routes/invite/invite.tsx:191`,
  `routes/reset-password/reset-password.tsx:112`).
- Admin routes are authenticated **server-side**, not by the SPA. The router
  classifies every route by prefix (`/admin`, `/store`, `/auth`) in
  `packages/core/framework/src/http/routes-loader.ts:37-39,103-111` and applies
  `authenticate()` (`packages/core/framework/src/http/middlewares/authenticate-middleware.ts`),
  which verifies a session cookie, a bearer JWT, or a secret API key before the
  handler runs. Hiding a link in the UI therefore cannot grant access.
- The session cookie is hardened upstream: `resolveSessionCookieSecurity()`
  (`packages/core/framework/src/http/express-loader.ts:32`) returns
  `{ sameSite: "lax", secure: true }` in production and staging, and never
  `none` (that was the CSRF root cause in GHSA-jhvc-qx3m-6r3q). Regression
  tests: `packages/core/framework/src/http/__tests__/express-loader.spec.ts`.
  Confirmed upstream code, not a local patch: fetched
  `medusajs/medusa@v2.17.1:packages/core/framework/src/http/express-loader.ts`
  via `gh api` and compared.
- Passwords are hashed with scrypt (`packages/modules/providers/auth-emailpass/src/services/emailpass.ts:51-52`,
  `{ logN: 15, r: 8, p: 1 }`, i.e. N=32768, configurable through `hashConfig`).
  The request asked for Argon2id/bcrypt; scrypt with these parameters is an
  accepted KDF and is not a defect. **Not changed** — swapping the KDF would
  invalidate every existing password hash.
- Secrets are enforced in production: a missing `JWT_SECRET` or `COOKIE_SECRET`
  **throws** at boot (`packages/core/framework/src/config/config.ts:104-131`);
  the `"supersecret"` fallback is development-only.

If the live Vercel deployment really does expose admin data, the cause is
outside this repo — most likely a Medusa backend with weak/absent
`JWT_SECRET`/`COOKIE_SECRET`, `adminCors` set to `*`, or a second app
(WordPress/preview/mock) on the same domain. **NOT VERIFIED** — I need the
deployment URL or the application repository to confirm.

---

## 3. Fixes implemented in this branch

All changes are in the framework HTTP layer (`packages/core/framework/src/http`),
because that is the only request-handling code that exists here.

| #   | Change                                                                                                                                                                                                                                                                                             | File                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `app.disable("x-powered-by")` — stop advertising the server implementation                                                                                                                                                                                                                         | `express-loader.ts:116`                                                                        |
| 2   | Baseline security response headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, HSTS in prod/staging)                                                                                                                                                    | new `utils/security-headers.ts`, wired at `express-loader.ts:118`                              |
| 3   | Session cookie `httpOnly: true` applied **after** the user-supplied `cookieOptions` spread, so it cannot be turned off by config                                                                                                                                                                   | `express-loader.ts:84`                                                                         |
| 4   | Single-use secrets (`token`, `access_token`, `refresh_token`, `id_token`, `invite_token`, `auth_token`, `verification_token`, `password`, `secret`, `api_key`, `signature`) redacted from the access log — both the URL and the `Referer` header, in the production JSON format and the dev format | new `utils/redact-sensitive-query-params.ts`, wired at `express-loader.ts:140-141,160,169,183` |

Deliberately **not** done:

- **No global Content-Security-Policy.** The same express process serves the
  JSON API, the admin bundle and user-uploaded files from `/static`. A single
  global CSP would either be so loose it protects nothing or strict enough to
  break the admin. Configure CSP at the edge (Vercel headers / reverse proxy)
  or per route in `src/api/middlewares.ts`. The reasoning is recorded in the
  doc comment of `resolveSecurityHeaders()` and asserted by a test.
- **`code` is not redacted** (promotion codes travel in storefront URLs, are not
  secrets, and are useful when debugging an order).
- **No KDF swap** (see §2).

---

## 4. Testing

`yarn install` for the monorepo **failed** in this sandbox:
`YN0001: RequestError: Client network socket disconnected before secure TLS
connection was established`, after **12m 35s** (`yarn install --mode=skip-build`).
`node_modules` was never created, so the project's own `turbo run test`,
`turbo run build` and `tsc -p packages/core/framework` could not be executed.
**Monorepo build: NOT VERIFIED.**

To still execute the real code, jest 29 + `@swc/jest` were installed in a
scratch directory and run with the **project's own transform configuration**
(copied from `define_jest_config.js`) against the repository files:

```
Test Suites: 2 passed, 2 total
Tests:       24 passed, 24 total
```

- `src/http/utils/__tests__/redact-sensitive-query-params.spec.ts` — 16 tests
  over the real module: no query string, absolute referer URLs, mixed
  parameters preserved byte-for-byte, case-insensitivity, `token[]`,
  percent-encoded keys, malformed percent-encoding, empty values, public
  promotion codes left intact, and both morgan token helpers.
- `src/http/utils/__tests__/security-headers.spec.ts` — 8 tests: the pure header
  resolver plus **real HTTP requests against a real express app** asserting the
  headers on the wire, HSTS only in production, and that a route handler can
  still override a header for a single route.

Types were checked with `tsc` 5.6.3 (the version the repo pins) using the repo's
compiler options, with `@medusajs/*` workspace imports stubbed and real
`@types/express` / `@types/morgan` installed. Diffing the error list before and
after the change shows **only line-number shifts of pre-existing errors — no new
type errors**. A full `tsc` pass on the package is still **NOT VERIFIED** (needs
the workspace build).

Runtime database workflows (cart → checkout → order → inventory → coupon),
admin CRUD, and the customer journey: **NOT VERIFIED** — no application, no
Postgres, no Redis in this sandbox.

---

## 5. Production environment variables (Medusa app)

Verified against the code that reads them:

| Variable                                               | Read by                                                                     | Required in production                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`                                  | `express-loader.ts`, `config.ts`                                            | yes — drives cookie `Secure`, HSTS, config validation                                                                                  |
| `JWT_SECRET`                                           | `packages/core/framework/src/config/config.ts:90`                           | **yes — boot fails without it**                                                                                                        |
| `COOKIE_SECRET`                                        | `packages/core/framework/src/config/config.ts:116-117`                      | **yes — boot fails without it**                                                                                                        |
| `DATABASE_URL`                                         | `packages/core/utils/src/modules-sdk/load-module-database-config.ts:74-106` | **yes** (or `[MODULE]_DATABASE_URL` / `MEDUSA_DATABASE_URL`)                                                                           |
| `REDIS_URL`                                            | app's `medusa-config.ts` (`projectConfig.redisUrl`)                         | strongly recommended: session store, workflow engine, event bus. Without it sessions live in process memory and break across instances |
| `JWT_PUBLIC_KEY`                                       | `config.ts:91`                                                              | only for asymmetric JWT; requires an explicit algorithm                                                                                |
| `DB_MIGRATION_CONCURRENCY`, `__MEDUSA_DB_CONNECTION_*` | db loader                                                                   | optional tuning                                                                                                                        |
| `MEDUSA_WORKER_MODE` (`server` \| `worker`)            | process split                                                               | yes if workers are deployed separately                                                                                                 |

Set in `medusa-config.ts`, not env: `http.adminCors`, `http.storeCors`,
`http.authCors` (comma-separated exact origins — never `*` in production),
`http.jwtExpiresIn`.

Never commit these. `.env.example` belongs in the **application** repository
(this framework repo intentionally ships none).

---

## 6. Admin bootstrap (no hardcoded password)

The CLI is the supported mechanism
(`packages/cli/medusa-cli/src/create-cli.ts:613-646` →
`packages/medusa/src/commands/user.ts`):

```bash
# one-off, from a machine with DATABASE_URL set
npx medusa user -e ops@yourdomain.com -p "$ADMIN_INITIAL_PASSWORD"

# or, preferred for a first login: issue an invite instead of a password
npx medusa user -e ops@yourdomain.com --invite
```

Rules:

1. `ADMIN_INITIAL_PASSWORD` comes from the secret store (Vercel secret, GitHub
   Actions secret, SSM), never from the repo, never from the frontend bundle.
2. Pass it inline to the CLI on a deploy worker/one-off job, not through an API
   endpoint. There is deliberately **no** HTTP route that creates an admin from
   a request body.
3. Use `--invite` where possible: the token is single-use, expires, and is
   emailed — no password ever exists outside the invitee's browser. (With this
   branch's log redaction, the token no longer leaks into access logs either.)
4. Rotate after first login; the dashboard exposes password change under
   Settings → My Account.

---

## 7. Vercel

- The **admin dashboard** (`packages/admin/dashboard`) is a static Vite SPA and
  deploys to Vercel fine; `vercel.json` already contains the SPA rewrite. It
  needs `VITE_MEDUSA_BACKEND_URL` at **build** time
  (`packages/admin/dashboard/vite.config.mts:11`); the default is
  `http://localhost:9000`, which is the most likely cause of a "blank/broken
  admin on Vercel" report.
- The **Medusa backend cannot run on Vercel's serverless functions**: it is a
  long-lived Node server (express + MikroORM connection pool + optional worker
  processes) and needs Postgres and Redis. Host it on a container platform
  (Railway, Render, Fly, ECS, Medusa Cloud) and point the Vercel-hosted
  storefront/admin at it. **NOT VERIFIED** for the specific live deployment —
  I have no access to the Vercel project.

---

## 8. Seeding 20 demo products

There is no application or database in this repository to seed, so this was
**not** done. The mechanism is `npx medusa exec ./src/scripts/seed.ts`
(`packages/cli/medusa-cli/src/create-cli.ts:647`) inside the app repository.
The generic product model already supports everything the request lists —
`handle`/`sku`/`status`, categories, collections, types, tags, options +
variants, multiple images, `metadata` (arbitrary JSON for category-specific
attributes), inventory items with `required_quantity`, sales channels, and
price lists — so a food/grocery/handmade/electronics catalog needs no schema
change. In-house vs third-party is modelled with the product `metadata` plus
per-variant inventory at different stock locations (one per vendor).

The seed script itself must live in the app repo; it is ready to be written once
the target application is identified.

---

## 9. Open items

1. **Identify the real deployment target.** This repo is the framework. The
   app (Medusa project + storefront + Vercel project) is elsewhere.
2. Run the monorepo suite where `yarn install` works:
   `yarn install && yarn workspace @medusajs/framework test` and
   `yarn build`.
3. Decide on CSP at the edge (Vercel `_headers` / `next.config` headers on the
   storefront) — the backend deliberately does not set one.
4. Merge or discard the sibling branch `arena/01a086ef-kisholoy`
   (`68b3647d`); its HTTP hardening overlaps with §3 and its `window.__sdk`
   dev handle should be dropped.
