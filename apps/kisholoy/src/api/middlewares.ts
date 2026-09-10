import { defineMiddlewares } from "@medusajs/framework/http"
import { securityHeaders } from "../lib/security-headers"

/**
 * Application level middlewares.
 *
 * Authentication and authorisation are NOT handled here: Medusa applies the
 * `authenticate()` middleware to every `/admin`, `/store` and `/auth` route
 * server side, based on the route path, before any handler runs. Verified
 * against a running instance: `GET /admin/products` without a token returns
 * 401, and a forged bearer token also returns 401.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "*",
      middlewares: [securityHeaders],
    },
  ],
})
