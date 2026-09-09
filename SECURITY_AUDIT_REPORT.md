# Security & Auth Audit Report — Admin Dashboard + API Auth

**Repository:** `md-muntasir-shihab/kisholoy` (fork of `medusajs/medusa`)
**Branch audited:** `arena/01a086ef-kisholoy` (based on `dbd8f697`)
**Date:** 2026-09-09
**Scope (agreed):** audit-only — admin dashboard + API authentication/authorization, with small safe fixes. No new apps.

---

## 1. Critical context: what this repository actually is

This repo is the **Medusa.js v2 framework monorepo** (API engine + 30+ commerce modules + admin dashboard + JS SDK), not a deployable shop project. Concretely:

| Original brief assumed | Reality in this repo |
|---|---|
| Next.js app deployed on Vercel | No storefront, no Vercel deployment (only `www/.vercelignore` for the docs site) |
| Hardcoded admin credentials / admin bypass | **None found.** No hardcoded passwords, tokens, or bypass routes anywhere in `packages/*/src` |
| A store backend project (`medusa-config.js`) | Only integration-test configs exist; real stores are scaffolded from this framework via `create-medusa-app` |
| Broken login / checkout / orders | No shop instance exists here to be broken; the framework's auth flows were audited statically |

**Bottom line:** the "insecure admin access / exposed credentials" symptoms from the brief do not exist in this codebase. They would have to come from a *store project built on this framework* (misconfiguration, custom code) — that project is not in this repo. This audit therefore verifies the framework's guarantees a store project inherits, finds the real gaps, and fixes what's safe to fix here.

---

## 2. How authentication & authorization work here (verified)

- **Admin API (`/admin/*`)** — default-deny. `router.ts` applies `authenticate("user", ["bearer","session","api-key"])` to the whole namespace. Only two routes opt out via `AUTHENTICATE = false`:
  - `POST /admin/invites/accept` — has its own `authenticate("user", …, { allowUnregistered: true })`; requires the single-use secret invite token. ✔ Safe.
  - `GET /admin/feature-flags` — fully public, returns only `{ feature_flags: { key: boolean } }`. Low-risk info disclosure (see F-05).
- **Store API (`/store/*`)** — requires a valid, non-revoked **publishable key** (`ensurePublishableApiKeyMiddleware`); customer auth is optional by default, required per-route for `/me`, order list, cart ownership changes, etc.
- **Registration is open but unprivileged.** `POST /auth/:actor/:provider/register` creates an *actorless* identity. Without a linked `user` record it cannot touch `/admin/*` (no `allowUnregistered` there). Admin access still requires the invite flow or the CLI bootstrap. ✔ Not a bypass.
- **Passwords:** scrypt (`scrypt-kdf`, `logN: 15, r: 8, p: 1`) via `@medusajs/auth-emailpass`; hashes are stripped from all responses (`sanitizeAuthIdentity_`). ✔
- **Password reset:** purpose-bound (`purpose: "reset"`), single-use (`jti` consumed in `auth_password_reset_token`), session tokens explicitly rejected on the update route; reset request always returns 201 to avoid identity enumeration. ✔
- **Invites:** JWT + DB match (rotated tokens rejected), expiry enforced (`expires_at`), single-use (deleted on accept). ✔
- **RBAC (flag `MEDUSA_FF_RBAC`, default OFF):** when on, route `policies` are enforced and role assignment requires the actor to already hold every policy being granted (`validateUserRolePermissionsStep`) — no self-elevation to super-admin. ✔ When off, policies are silently skipped (see F-06).
- **Sessions:** server-side (Redis in production), cookie is `Secure` + `SameSite=Lax` + `httpOnly` in prod/staging (explicit `httpOnly` added by this audit); JWT default 1d, session 10h.
- **Secrets:** production boot **refuses to start** without `JWT_SECRET`/`COOKIE_SECRET` (`rejectErrors` throws; `supersecret` fallback is dev-only with a warning). ✔
- **Errors:** 500s return generic messages, no stacks; only 4xx validation details are echoed; Postgres errors are mapped to safe messages. ✔
- **Dashboard:** session-auth by default, `ProtectedRoute` → `/login` via `useMe()` (`/admin/users/me` is ownership-bound to `auth_context.actor_id`); no tokens in dashboard `localStorage`; no open redirect (`from` comes from router state); zod-validated forms. ✔
- **Payload limits:** express defaults (100 kb JSON) unless a route opts into a larger batch limit. ✔
- **No secrets committed** (swept for keys/tokens/private keys; only empty test DB placeholders exist).

---

## 3. Findings

Severity reflects exploitability **in a store built on this framework with default config**.

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-01 | **Medium** | `GET /store/orders/:id` is public (guest order lookup). Returns PII (email, shipping/billing addresses) to anyone holding the order ID. Source carries `TODO: Do we want to apply some sort of authentication here?` | Recommended fix (breaking-change; not applied) |
| F-02 | **Medium** | No rate limiting on `/auth/*` (login/register/reset/token) — brute-force / credential-stuffing / invite-enumeration exposure | Recommended fix at proxy/WAF (not applied in framework) |
| F-03 | **Medium** | No password-strength policy: server accepts any string (even 1 char); dashboard enforces only `min(1)` | Recommended (not applied — needs product decision) |
| F-04 | Low | Invite token travels in URL query → captured in HTTP access logs (morgan logs full URL + `Referer`), browser history, proxies | **Partially fixed:** tokens redacted from access logs (this audit) |
| F-05 | Low | `GET /admin/feature-flags` is unauthenticated (returns flag map) | Recommended: confirm intent / document |
| F-06 | Low | RBAC default OFF → **every authenticated user is a full admin** and all route `policies` are silently ignored | Recommended: document + boot warning |
| F-07 | Low | With RBAC ON, secret API keys (`actor_type: api-key`, no roles) fail every policied route with 403 — no test or special-case covers this; either integrations break or operators turn RBAC off | Recommended: maintainers must decide (bypass-with-audit vs key roles) |
| F-08 | Info | `X-Powered-By: Express` header disclosed on all responses | **Fixed (this audit)** |
| F-09 | Info | Session cookie `httpOnly` relied on express-session default (implicit) | **Fixed:** now explicit (this audit) |
| F-10 | Info | Dashboard attached authenticated SDK to `window.__sdk` in production builds | **Fixed:** dev-only (this audit) |
| F-11 | Info | No security headers (HSTS/CSP/frame/etc.) in framework | Recommended at proxy/CDN (intentionally not in framework) |
| F-12 | Info | Default session cookie name `connect.sid` fingerprints the stack | Recommended: rename via `sessionOptions.name` |
| F-13 | Info | JS-SDK `jwt` mode stores tokens in `localStorage` (XSS tradeoff); `session` mode (dashboard default) is cookie-based | Documented; no change (by design) |

### Details & recommended remediations

**F-01 — Public order lookup.** `packages/medusa/src/api/store/orders/[id]/route.ts`. Order IDs are unguessable, but they leak through emails, support tickets, and logs. Options: (a) require `?email=` match for guests; (b) issue a short-lived signed tracking token at order creation; (c) require customer auth and keep a separate tokenized guest endpoint. Not changed here — any option alters guest-checkout UX.

**F-02 — Rate limiting.** No limiter exists in `packages/core/framework` or `packages/medusa`. Recommended production setup (reverse proxy, e.g. nginx/traefik/Cloudflare): strict limits on `/auth/*` (e.g. 10–20 req/min/IP with burst), moderately strict on `/store/*` write routes, plus CAPTCHA/bot management on login. A framework-level limiter would need Redis-backed shared state and is a larger feature.

**F-03 — Password policy.** `packages/modules/providers/auth-emailpass/src/services/emailpass.ts` (`register`/`update`) and dashboard `invite.tsx` / `reset-password.tsx` (`min(1)`). Recommend: configurable `passwordPolicy` (min length ≥ 10, optionally complexity) enforced **server-side** in the emailpass provider, mirrored in dashboard zod schemas. Not applied: changing framework defaults can lock out existing users and break tests; needs a migration/grandfathering decision.

**F-04 — Token in URL + logs.** Invite accept uses `POST /admin/invites/accept?token=…` (`packages/core/js-sdk/src/admin/invite.ts`, `packages/medusa/src/api/admin/invites/accept/route.ts`). **Fixed part:** `express-loader.ts` now redacts `token`, `invite_token`, `auth_token`, `code`, `password` query values (and the same in `Referer`) from both JSON and dev access logs — unit-tested. **Remaining:** move the invite token into the POST body / header in a future major (SDK + API change).

**F-05 — Public feature flags.** `packages/medusa/src/api/admin/feature-flags/route.ts` (`AUTHENTICATE = false`). Risk is limited (boolean map), and it likely exists for pre-auth dashboard rendering — but it's undocumented. Recommend an explicit comment + docs note, or relocating it under `/auth`.

**F-06 — Silent RBAC-off.** `router.ts` skips `wrapWithPoliciesCheck` when the flag is off. Recommend a loud boot log when RBAC is off ("all authenticated users have full admin access") and a docs callout, since route files *look* policied.

**F-07 — API keys vs RBAC.** `check-permissions.ts` has no `api-key` actor handling → empty roles → `FORBIDDEN`. Recommend maintainers pick one semantic and test it: (a) secret keys act as super-admin (log each use), or (b) roles attachable to API keys.

**F-11 — Security headers.** Deliberately not added to the framework: wrong global CSP/HSTS breaks plugin storefronts and embedded dashboards. Set at the edge instead (example: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, frame rules) and test the admin SPA after each addition.

---

## 4. Changes implemented in this audit

All on branch `arena/01a086ef-kisholoy`:

1. **`packages/core/framework/src/http/express-loader.ts`**
   - `app.disable("x-powered-by")` (F-08).
   - Explicit `httpOnly: true` in the session cookie defaults (F-09).
   - New exported `redactSensitiveQueryParams()` + `sanitized-url` / `sanitized-referrer` morgan tokens; applied to both production JSON logs and dev logs (F-04).
2. **`packages/core/framework/src/http/__tests__/express-loader.spec.ts`** — 6 new unit tests for the redaction helper (incl. case-insensitivity, non-sensitive preservation, valueless keys, malformed encoding).
3. **`packages/admin/dashboard/src/lib/client/client.ts`** — `window.__sdk` debug handle now exposed in development builds only (F-10).
4. **`packages/admin/dashboard/src/vite-env.d.ts`** — typed `import.meta.env.DEV/PROD` to support the above.

### Verification performed
- Full-file transpile check (esbuild) of all four touched files: OK.
- Executed the **actual** `redactSensitiveQueryParams` extracted from the edited file against 11 cases (the 6 spec cases + edge cases: substring keys like `mytoken` must not match, percent-encoded keys, full URLs): **all pass**.
- Repo unit suite (`jest`) and integration suites **NOT RUN** — dependencies are not installed and the sandbox registry mirror is unavailable for yarn; run `yarn install` then `yarn workspace @medusajs/framework test` in CI before merging.
- No live store exists, so login/checkout/order flows were verified by code-path inspection, not end-to-end. Stated plainly: **E2E NOT VERIFIED**.

---

## 5. Production environment variables (for a store project on this framework)

These are the security-critical ones (see `packages/core/framework/src/config/config.ts`):

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | Enables secure cookies, fails boot on missing secrets |
| `JWT_SECRET` | yes | Long random value (≥32 bytes). Boot fails in prod without it |
| `COOKIE_SECRET` | yes | Long random value, different from `JWT_SECRET` |
| `DATABASE_URL` | yes | Postgres; never commit; use the host's secret store |
| `REDIS_URL` | yes | Required for prod sessions (else in-memory store) |
| `MEDUSA_FF_RBAC` | recommended | Set `true` if you need non-admin staff roles (see F-06/F-07) |
| `ADMIN_CORS` / `AUTH_CORS` / `STORE_CORS` | yes | Exact origins, no `*` with credentials |
| `JWT_EXPIRES_IN` | optional | Default `1d` — consider shorter (e.g. `2h`) for admin actors |

Never expose secrets via `VITE_*` / `NEXT_PUBLIC_*`, logs, or API responses. No `.env.example` is added here because this repo contains no store project to configure — add one in the store project, not the framework.

---

## 6. Admin bootstrap procedure (secure, no hardcoded password)

Run once per environment from the **store project** (not this repo), with secrets from the environment, never from chat/files:

```bash
# Preferred: create an invite, redeem it in the dashboard (password never touches shell history)
npx medusa user --email admin@example.com --invite
# → prints an invite token; open https://<admin-host>/invite?token=<token>

# Alternative: direct creation (ensure the password is injected, not typed/stored)
npx medusa user --email "$ADMIN_EMAIL" --password "$ADMIN_INITIAL_PASSWORD"
```

Then: enable MFA for the admin identity, rotate/remove the bootstrap secret, and manage further admins via dashboard invites with least-privilege roles (RBAC on). There is no password-change-on-first-login flag in the framework — if required, implement it as a store-project customization.

---

## 7. Out of scope / NOT VERIFIED

- Payment provider webhooks (Stripe signature verification), fulfillment/notification providers, and module business logic — not in the agreed scope.
- Any real deployment (Vercel or otherwise) — none exists for this repo; the original brief's "Vercel deployment" could not be located.
- E2E auth flows against a running server + database — not run (no installed deps / DB in this environment).
- The fork's earlier dashboard sidebar change (`dbd8f697`) was not re-audited beyond noting its permission-gated badge query is consistent with the findings above.

## 8. Bottom line

The framework's auth core is **sound**: default-deny admin auth, no hard
...[truncated 794 chars]