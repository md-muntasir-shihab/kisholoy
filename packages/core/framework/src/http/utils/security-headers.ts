import type { RequestHandler } from "express"

/**
 * Number of seconds in two years, the recommended HSTS max-age.
 */
const HSTS_MAX_AGE = 63072000

export type SecurityHeaders = Record<string, string>

/**
 * Resolves the baseline security headers sent with every response.
 *
 * `Strict-Transport-Security` is only sent in production/staging: sending it
 * from an http development server would pin the browser to https for the
 * configured max-age and lock developers out of their own localhost setup.
 *
 * A Content-Security-Policy is deliberately *not* part of this baseline. The
 * same express app serves the JSON API, the static admin bundle and
 * user-uploaded files from `/static`, so a single global CSP would either be
 * so loose that it protects nothing or strict enough to break the admin.
 * Configure CSP per deployment (reverse proxy or `middlewares.ts`) instead.
 */
export function resolveSecurityHeaders({
  isProduction,
  isStaging,
}: {
  isProduction: boolean
  isStaging: boolean
}): SecurityHeaders {
  const headers: SecurityHeaders = {
    // Stop browsers from sniffing a response away from its declared type.
    "X-Content-Type-Options": "nosniff",
    // Keep the full URL (which can carry single-use tokens) out of referrers
    // that leave the origin.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // The admin dashboard is a state-changing UI; do not let it be framed by
    // another origin. Same-origin framing keeps working.
    "X-Frame-Options": "SAMEORIGIN",
    // Disable browser features the API and the admin have no use for.
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), display-capture=()",
  }

  if (isProduction || isStaging) {
    headers["Strict-Transport-Security"] = `max-age=${HSTS_MAX_AGE}`
  }

  return headers
}

/**
 * Express middleware that applies {@link resolveSecurityHeaders}.
 *
 * The headers are written before the route handlers run, so a handler that
 * sets one of them explicitly still wins for that route.
 */
export const securityHeaders = ({
  isProduction,
  isStaging,
}: {
  isProduction: boolean
  isStaging: boolean
}): RequestHandler => {
  const headers = resolveSecurityHeaders({ isProduction, isStaging })

  return (_req, res, next) => {
    for (const [name, value] of Object.entries(headers)) {
      if (!res.getHeader(name)) {
        res.setHeader(name, value)
      }
    }

    next()
  }
}
