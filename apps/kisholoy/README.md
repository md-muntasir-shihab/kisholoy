# Kisholoy — Medusa backend

The commerce backend for Kisholoy: in-house products plus third-party/vendor
products, sold through the same storefront with one checkout.

Built on [Medusa](https://medusajs.com) v2. The catalog is product-agnostic —
food, handmade goods, beauty, kitchen, fashion, electronics and stationery all
live in the same schema, and a new category needs no migration.

---

## 1. Prerequisites

- Node 20+
- Postgres 14+ (any managed Postgres works)
- Redis in production (session store, workflow engine, event bus)

```bash
cp .env.example .env      # then fill in DATABASE_URL, JWT_SECRET, COOKIE_SECRET
npm install
npm run db:migrate
```

`JWT_SECRET` and `COOKIE_SECRET` are **required**: `medusa-config.ts` throws at
config load time if either is missing, and rejects `*` in any CORS list.

## 2. Admin bootstrap

There is no hardcoded admin password anywhere. The first admin is created from
environment variables, which are read by `src/scripts/create-admin.ts`:

```bash
ADMIN_EMAIL=ops@yourdomain.test \
ADMIN_INITIAL_PASSWORD="$(openssl rand -base64 18)" \
  npm run create:admin
```

- The password is hashed with scrypt by the `emailpass` provider before it is
  written and is never printed, returned or logged.
- Environment variables are used instead of command line arguments on purpose:
  argv is readable by any user on the host through `/proc/<pid>/cmdline`.
- Rotate the password after the first login (Admin → Settings → My Account).
- Prefer an invite for everyone after the first admin: Admin → Settings →
  Users → Invite. Invite tokens are single-use and expire.

## 3. Demo catalog

```bash
npm run db:seed
```

Seeds, idempotently:

| What                | Count | Notes                                                                                               |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| Products            | 21    | across 7 top-level categories and 6 subcategories                                                   |
| Variants            | 24    | some products have real options (size, edition, colour)                                             |
| Categories          | 13    | Food & Grocery, Handmade & Crafts, Beauty, Home & Kitchen, Fashion, Electronics, Stationery & Gifts |
| Stock locations     | 4     | 1 in-house warehouse + 3 vendor locations                                                           |
| Regions / currency  | 1     | Bangladesh, BDT                                                                                     |
| Delivery options    | 2     | Standard ৳60, Express ৳120                                                                          |
| Coupons             | 2     | `KISHOLOY10` (10% off order), `FREESHIP60` (fixed ৳60 off shipping)                                 |
| Publishable API key | 1     | printed at the end of the run; needed by the storefront                                             |

**In-house vs third-party** is carried in product `metadata`, because that is
where per-category attributes belong in a product-agnostic model:

```jsonc
{
  "selling_model": "third_party", // or "in_house"
  "vendor_id": "shundor-naturals",
  "vendor_name": "Shundor Naturals",
  "commission_rate": 15, // third party only
  "cost_price_minor": 9600, // in-house only, for margin reports
  "unit": "500 g jar",
  "return_eligible": false,
  "shelf_life_months": 24
}
```

Stock for each product is held at the stock location of whoever owns it, so
vendor inventory and in-house inventory never mix, and vendor fulfilment and
payout reporting can be filtered by location.

### Images

Product photography lives in `static/products/<handle>.jpg` and is served by the
backend at `/static/products/<handle>.jpg`. Same-origin URLs mean no third-party
image host can break a product page, and there is nothing in the database but a
URL (no base64 blobs).

If a product's own photograph does not exist yet, the seed uses
`static/products/_placeholder.jpg` instead, so no product page can render a
broken image. Replace a placeholder by dropping a `<handle>.jpg` into that
folder and re-running `npm run db:seed` (the seed refreshes image URLs without
touching prices or stock).

## 4. Run

```bash
npm run dev            # API on :9000, admin on :9000/app
```

Storefront requests need the `x-publishable-api-key` header with the key
printed by the seed.

## 5. What has been verified against a running instance

| Check                                            | Result                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /admin/products` with no token              | **401**                                                                                                                        |
| `GET /admin/products` with a forged bearer token | **401**                                                                                                                        |
| Admin login → `/auth/user/emailpass`             | 200, 504-char JWT                                                                                                              |
| Products via admin and store APIs                | 21 products, correct BDT prices                                                                                                |
| Product image URL                                | 200 `image/jpeg`, placeholder fallback works                                                                                   |
| Cart created with `unit_price: 1` (tampering)    | stored at the real price 18000, subtotal 36000                                                                                 |
| Cart with `quantity: -3`                         | 400, validation error                                                                                                          |
| Cart with `quantity: 500` (stock 120)            | `insufficient_inventory`, order refused                                                                                        |
| Shipping                                         | ৳120 Express added, total 48000 = 36000 items + 12000 shipping                                                                 |
| Coupon `HACKED99`                                | rejected: "The promotion code HACKED99 is invalid"                                                                             |
| Coupon `KISHOLOY10`                              | 10% off 36000 → discount 3600, total 32400                                                                                     |
| Cart complete                                    | order created (`display_id` 1), status `pending`                                                                               |
| Payment status after checkout                    | collection `authorized`, `paid_total: 0` — the manual provider does **not** pretend money was taken; an admin must capture     |
| Inventory after the order                        | `stocked_quantity` 120, `reserved_quantity` 2 at the in-house location                                                         |
| Re-running the seed                              | 0 products created, 0 inventory levels created, image URLs refreshed                                                           |
| Security headers on `/health` and `/store/*`     | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` (HSTS additionally in production/staging) |

## 6. Payments

The seeded region uses Medusa's built-in manual provider
(`pp_system_default`). It is a real provider in Medusa terms but it does not
move money: the payment collection ends up `authorized` with `paid_total: 0`
until an admin captures it. That is the honest stand-in for cash on delivery.

To take real payments, add bKash/Nagad/SSLCommerz/Stripe to the `modules` array
in `medusa-config.ts` and add the provider id to the region. Verify the webhook
signature server side before marking anything paid.

## 7. Deploying

The backend is a long-lived Node server with a Postgres connection pool — it
does **not** run on Vercel's serverless functions. Host it on a container
platform (Railway, Render, Fly, ECS, Medusa Cloud) and point the storefront at
it. The admin dashboard in `packages/admin/dashboard` _is_ Vercel-ready as a
static SPA and needs `VITE_MEDUSA_BACKEND_URL` at build time.

Production checklist:

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET`, `COOKIE_SECRET` from the secret store (boot fails without them)
- [ ] `DATABASE_URL` with SSL
- [ ] `REDIS_URL` set
- [ ] `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` list exact origins (no `*`)
- [ ] `MEDUSA_BACKEND_URL` is the public https origin (image URLs are absolute)
- [ ] `file-local` swapped for the S3 provider so uploads survive redeploys
- [ ] Admin bootstrap run once, password rotated
- [ ] Demo data not seeded into production unless intended
- [ ] CSP set at the edge (deliberately not set by the server)
