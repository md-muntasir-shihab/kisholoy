import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

/**
 * Secrets are required, never defaulted.
 *
 * `@medusajs/framework` already refuses to boot in production without
 * `JWT_SECRET` / `COOKIE_SECRET` (it only falls back to `"supersecret"` in
 * development). Re-checking here means a missing secret fails at config load
 * time with a clear message instead of surfacing as an opaque auth error later.
 */
const requireSecret = (name: string): string => {
  const value = process.env[name]

  if (!value) {
    throw new Error(
      `[kisholoy] Missing required environment variable ${name}. ` +
        `Set it from your secret store; it must never be committed.`
    )
  }

  return value
}

const isProduction = process.env.NODE_ENV === "production"

/**
 * Payments: Medusa registers the manual `pp_system_default` provider by
 * default. It does NOT move money - an order "paid" with it stays
 * `payment_status: not_paid` until an admin captures it, which makes it the
 * honest stand-in for cash on delivery. Wire bKash/Nagad/SSLCommerz/Stripe in
 * the `modules` array below before taking real payments.
 */

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE ?? "server") as
      | "server"
      | "worker"
      | "shared",
    http: {
      jwtSecret: requireSecret("JWT_SECRET"),
      cookieSecret: requireSecret("COOKIE_SECRET"),
      jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
      // Exact origins only. A wildcard here would let any website drive an
      // authenticated admin session.
      storeCors: requireList("STORE_CORS", isProduction),
      adminCors: requireList("ADMIN_CORS", isProduction),
      authCors: requireList("AUTH_CORS", isProduction),
    },
  },
  modules: [
    {
      // Local file storage for demo/dev. Swap for the S3 provider
      // (`@medusajs/medusa/file-s3`) in production so uploads survive redeploys.
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: "static/uploads",
            },
          },
        ],
      },
    },
  ],
  admin: {
    // The admin bundle is served by this same server unless a separate
    // deployment is preferred (packages/admin/dashboard is Vercel-ready).
    disable: process.env.DISABLE_ADMIN === "true",
  },
})

function requireList(name: string, strict: boolean): string {
  const value = process.env[name]

  if (!value) {
    if (strict) {
      throw new Error(
        `[kisholoy] Missing required environment variable ${name} in production. ` +
          `Use a comma separated list of exact origins, never "*".`
      )
    }

    return "http://localhost:9000,http://localhost:8000,http://localhost:5173,http://localhost:3000"
  }

  if (value.split(",").some((origin) => origin.trim() === "*")) {
    throw new Error(
      `[kisholoy] ${name} must not contain "*". List the exact origins instead.`
    )
  }

  return value
}
