/**
 * Query string parameters whose values must never reach the access logs.
 *
 * Single-use secrets are transported as URL query parameters in a few places:
 *
 * - `POST /auth/invite/accept?token=...` (admin/user invite token)
 * - `GET  /reset-password?token=...` (password reset token)
 * - `/auth/:provider/callback?code=...&state=...` (OAuth style callbacks)
 *
 * Morgan logs the full URL *and* the `Referer` header by default, so without
 * redaction those secrets end up in log aggregators where they outlive the
 * request that produced them.
 *
 * Note: public values such as promotion `code`s are intentionally *not*
 * redacted - they are not secrets and they are genuinely useful when
 * debugging an order.
 */
export const SENSITIVE_QUERY_PARAMS: ReadonlySet<string> = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "invite_token",
  "auth_token",
  "verification_token",
  "password",
  "secret",
  "api_key",
  "signature",
])

export const REDACTED_VALUE = "[REDACTED]"

/**
 * Strips an array suffix (`token[]`) so that `token[]=abc` is matched too.
 */
function normalizeKey(key: string): string {
  const decoded = decodeKey(key)

  return decoded.replace(/\[\d*\]$/, "").toLowerCase()
}

function decodeKey(key: string): string {
  try {
    return decodeURIComponent(key)
  } catch {
    // Keep the raw key when it is not valid percent-encoding.
    return key
  }
}

/**
 * The subset of an incoming request the log tokens read. Morgan types its
 * request as a plain `http.IncomingMessage`, which knows nothing about the
 * express specific `originalUrl`.
 */
export type RedactableRequest = {
  url?: string
  originalUrl?: string
  headers?: Record<string, string | string[] | undefined>
}

const firstHeaderValue = (
  value: string | string[] | undefined
): string | undefined => (Array.isArray(value) ? value[0] : value)

/**
 * Replaces the value of known-sensitive query parameters with `[REDACTED]`,
 * leaving the rest of the URL untouched.
 *
 * The input is treated as an opaque string on purpose: it may be a path with a
 * query string (`/admin/invites/accept?token=x`) or an absolute URL coming from
 * a `Referer` header (`https://shop.test/invite?token=x`).
 */
export function redactSensitiveQueryParams(url: string): string {
  if (!url) {
    return url
  }

  const queryStart = url.indexOf("?")
  if (queryStart === -1) {
    return url
  }

  const base = url.slice(0, queryStart + 1)
  const query = url.slice(queryStart + 1)
  if (!query) {
    return url
  }

  const redactedQuery = query
    .split("&")
    .map((pair) => {
      if (!pair) {
        return pair
      }

      const separatorIndex = pair.indexOf("=")
      if (separatorIndex === -1) {
        // A sensitive flag without a value cannot leak anything.
        return pair
      }

      const rawKey = pair.slice(0, separatorIndex)
      const value = pair.slice(separatorIndex + 1)

      if (!value) {
        return pair
      }

      return SENSITIVE_QUERY_PARAMS.has(normalizeKey(rawKey))
        ? `${rawKey}=${REDACTED_VALUE}`
        : pair
    })
    .join("&")

  return base + redactedQuery
}

/**
 * The request URL with sensitive query parameters redacted, for use as a morgan
 * log token.
 */
export function sanitizedRequestUrl(req: RedactableRequest): string {
  return redactSensitiveQueryParams(req.originalUrl ?? req.url ?? "")
}

/**
 * The `Referer` header with sensitive query parameters redacted. Falls back to
 * `"-"`, matching morgan's own `:referrer` token.
 */
export function sanitizedRequestReferrer(req: RedactableRequest): string {
  const headers = req.headers ?? {}

  return redactSensitiveQueryParams(
    firstHeaderValue(headers.referrer) ??
      firstHeaderValue(headers.referer) ??
      "-"
  )
}
