import {
  REDACTED_VALUE,
  redactSensitiveQueryParams,
  sanitizedRequestReferrer,
  sanitizedRequestUrl,
} from "../redact-sensitive-query-params"

describe("redactSensitiveQueryParams", () => {
  it("returns the input untouched when there is no query string", () => {
    expect(redactSensitiveQueryParams("/admin/orders")).toBe("/admin/orders")
    expect(redactSensitiveQueryParams("")).toBe("")
  })

  it("redacts single-use tokens in the URL", () => {
    expect(redactSensitiveQueryParams("/auth/invite/accept?token=abc123")).toBe(
      `/auth/invite/accept?token=${REDACTED_VALUE}`
    )
  })

  it("redacts tokens carried by an absolute referer URL", () => {
    expect(
      redactSensitiveQueryParams("https://shop.test/invite?token=abc123")
    ).toBe(`https://shop.test/invite?token=${REDACTED_VALUE}`)
  })

  it("keeps every non-sensitive parameter byte-for-byte", () => {
    const url =
      "/admin/orders?status[]=pending&limit=10&fields=id,status&token=abc123"

    expect(redactSensitiveQueryParams(url)).toBe(
      `/admin/orders?status[]=pending&limit=10&fields=id,status&token=${REDACTED_VALUE}`
    )
  })

  it("is case-insensitive and handles array-style keys", () => {
    expect(redactSensitiveQueryParams("/x?TOKEN=abc")).toBe(
      `/x?TOKEN=${REDACTED_VALUE}`
    )
    expect(redactSensitiveQueryParams("/x?token[]=abc")).toBe(
      `/x?token[]=${REDACTED_VALUE}`
    )
  })

  it("redacts every sensitive parameter, not just the first one", () => {
    expect(
      redactSensitiveQueryParams("/x?access_token=a&refresh_token=b&limit=5")
    ).toBe(
      `/x?access_token=${REDACTED_VALUE}&refresh_token=${REDACTED_VALUE}&limit=5`
    )
  })

  it("redacts percent-encoded keys", () => {
    // `%74oken` decodes to `token`.
    expect(redactSensitiveQueryParams("/x?%74oken=abc")).toBe(
      `/x?%74oken=${REDACTED_VALUE}`
    )
  })

  it("does not throw on malformed percent-encoding", () => {
    expect(redactSensitiveQueryParams("/x?%E0%A4%A=abc&token=abc")).toBe(
      `/x?%E0%A4%A=abc&token=${REDACTED_VALUE}`
    )
  })

  it("leaves flags without a value and empty values alone", () => {
    expect(redactSensitiveQueryParams("/x?token")).toBe("/x?token")
    expect(redactSensitiveQueryParams("/x?token=")).toBe("/x?token=")
  })

  it("does not redact public values such as promotion codes", () => {
    expect(redactSensitiveQueryParams("/store/carts?code=SUMMER10")).toBe(
      "/store/carts?code=SUMMER10"
    )
  })

  it("keeps an empty query string as-is", () => {
    expect(redactSensitiveQueryParams("/admin/orders?")).toBe("/admin/orders?")
  })
})

describe("sanitizedRequestUrl", () => {
  it("prefers originalUrl and redacts the token it carries", () => {
    expect(
      sanitizedRequestUrl({
        originalUrl: "/auth/invite/accept?token=abc123",
        url: "/accept",
      })
    ).toBe(`/auth/invite/accept?token=${REDACTED_VALUE}`)
  })

  it("falls back to url and then to an empty string", () => {
    expect(sanitizedRequestUrl({ url: "/x?token=abc" })).toBe(
      `/x?token=${REDACTED_VALUE}`
    )
    expect(sanitizedRequestUrl({})).toBe("")
  })
})

describe("sanitizedRequestReferrer", () => {
  it("redacts a token carried by the referrer header", () => {
    expect(
      sanitizedRequestReferrer({
        headers: { referrer: "https://shop.test/invite?token=abc123" },
      })
    ).toBe(`https://shop.test/invite?token=${REDACTED_VALUE}`)
  })

  it("accepts the alternate referer spelling and array values", () => {
    expect(
      sanitizedRequestReferrer({
        headers: { referer: ["https://shop.test/reset?token=abc123"] },
      })
    ).toBe(`https://shop.test/reset?token=${REDACTED_VALUE}`)
  })

  it('returns "-" when there is no referrer, like morgan does', () => {
    expect(sanitizedRequestReferrer({ headers: {} })).toBe("-")
    expect(sanitizedRequestReferrer({})).toBe("-")
  })
})
