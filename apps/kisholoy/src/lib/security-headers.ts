import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

/**
 * Baseline security headers for every response this server sends.
 *
 * `Strict-Transport-Security` is only sent in production/staging: sending it
 * from a local http server pins the browser to https for the configured
 * max-age and locks developers out of their own machine.
 *
 * There is deliberately no Content-Security-Policy here. This process serves
 * the JSON API, the admin bundle and user uploads from `/static`, so a single
 * global CSP would either be so loose it protects nothing or strict enough to
 * break the admin. Set CSP at the edge (Vercel headers, CDN or reverse proxy)
 * where the document origins are known.
 */
const HSTS_MAX_AGE = 63072000 // two years

const isProductionLike = () => {
  const env = process.env.NODE_ENV ?? "development"

  return env === "production" || env === "staging"
}

export const securityHeaders = (
  _req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const headers: Record<string, string> = {
    // Never sniff a response away from its declared content type.
    "X-Content-Type-Options": "nosniff",
    // Keep full URLs (which can carry single-use tokens) out of cross-origin
    // referrers.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // The admin is a state-changing UI; do not let another origin frame it.
    "X-Frame-Options": "SAMEORIGIN",
    // Browser features this API and the admin have no use for.
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), display-capture=()",
  }

  if (isProductionLike()) {
    headers["Strict-Transport-Security"] = `max-age=${HSTS_MAX_AGE}`
  }

  for (const [name, value] of Object.entries(headers)) {
    if (!res.getHeader(name)) {
      res.setHeader(name, value)
    }
  }

  next()
}
