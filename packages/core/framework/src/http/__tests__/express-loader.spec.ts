import {
  redactSensitiveQueryParams,
  resolveSessionCookieSecurity,
} from "../express-loader"

describe("resolveSessionCookieSecurity", () => {
  it("returns insecure, no SameSite outside of production/staging", () => {
    expect(
      resolveSessionCookieSecurity({ isProduction: false, isStaging: false })
    ).toEqual({ sameSite: false, secure: false })
  })

  it("returns sameSite=lax + secure in production", () => {
    expect(
      resolveSessionCookieSecurity({ isProduction: true, isStaging: false })
    ).toEqual({ sameSite: "lax", secure: true })
  })

  it("returns sameSite=lax + secure in staging", () => {
    expect(
      resolveSessionCookieSecurity({ isProduction: false, isStaging: true })
    ).toEqual({ sameSite: "lax", secure: true })
  })

  it("never returns sameSite=none — that would allow cross-site cookies on POST and reintroduce CSRF", () => {
    const envs = [
      { isProduction: true, isStaging: false },
      { isProduction: false, isStaging: true },
      { isProduction: true, isStaging: true },
      { isProduction: false, isStaging: false },
    ]

    for (const env of envs) {
      const { sameSite } = resolveSessionCookieSecurity(env)
      expect(sameSite).not.toBe("none")
    }
  })
})

describe("redactSensitiveQueryParams", () => {
  it("returns URLs without a query string unchanged", () => {
    expect(redactSensitiveQueryParams("/admin/products")).toBe(
      "/admin/products"
    )
    expect(redactSensitiveQueryParams("/health?")).toBe("/health?")
  })

  it("redacts the invite token query parameter", () => {
    expect(
      redactSensitiveQueryParams("/admin/invites/accept?token=eyJhbGciOiJIUzI1NiJ9")
    ).toBe("/admin/invites/accept?token=[REDACTED]")
  })

  it("redacts sensitive params while preserving the rest of the query", () => {
    expect(
      redactSensitiveQueryParams(
        "/admin/invites/accept?fields=id&token=secret&limit=10"
      )
    ).toBe("/admin/invites/accept?fields=id&token=[REDACTED]&limit=10")
  })

  it("redacts all known sensitive parameters case-insensitively", () => {
    expect(
      redactSensitiveQueryParams(
        "/x?TOKEN=a&invite_token=b&auth_token=c&code=d&password=e&next=/orders"
      )
    ).toBe(
      "/x?TOKEN=[REDACTED]&invite_token=[REDACTED]&auth_token=[REDACTED]&code=[REDACTED]&password=[REDACTED]&next=/orders"
    )
  })

  it("leaves non-sensitive parameters untouched", () => {
    const url = "/store/products?currency_code=usd&limit=12&offset=0"
    expect(redactSensitiveQueryParams(url)).toBe(url)
  })

  it("handles keys without values and malformed percent-encoding", () => {
    expect(redactSensitiveQueryParams("/x?token")).toBe("/x?token=[REDACTED]")
    expect(redactSensitiveQueryParams("/x?%E0%A4%A=1")).toBe("/x?%E0%A4%A=1")
  })
})
