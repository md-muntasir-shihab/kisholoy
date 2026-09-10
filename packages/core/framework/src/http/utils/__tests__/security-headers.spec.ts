import express from "express"
import http from "http"
import type { AddressInfo } from "net"

import { resolveSecurityHeaders, securityHeaders } from "../security-headers"

const request = (
  server: http.Server,
  path: string
): Promise<http.IncomingMessage> =>
  new Promise((resolve, reject) => {
    const { port } = server.address() as AddressInfo

    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        res.resume()
        resolve(res)
      })
      .on("error", reject)
  })

const listen = (app: express.Express): Promise<http.Server> =>
  new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server))
  })

const close = (server: http.Server): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()))

describe("resolveSecurityHeaders", () => {
  it("always sends the baseline headers", () => {
    const headers = resolveSecurityHeaders({
      isProduction: false,
      isStaging: false,
    })

    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN")
    expect(headers["Permissions-Policy"]).toContain("camera=()")
  })

  it("does not send HSTS from a development server", () => {
    expect(
      resolveSecurityHeaders({ isProduction: false, isStaging: false })
    ).not.toHaveProperty("Strict-Transport-Security")
  })

  it("sends HSTS in production and in staging", () => {
    for (const env of [
      { isProduction: true, isStaging: false },
      { isProduction: false, isStaging: true },
    ]) {
      expect(resolveSecurityHeaders(env)["Strict-Transport-Security"]).toMatch(
        /^max-age=\d+$/
      )
    }
  })

  it("pins HSTS for at least six months", () => {
    const maxAge = Number(
      resolveSecurityHeaders({ isProduction: true, isStaging: false })[
        "Strict-Transport-Security"
      ].replace("max-age=", "")
    )

    expect(maxAge).toBeGreaterThanOrEqual(15552000)
  })

  it("never sends a Content-Security-Policy it cannot guarantee", () => {
    // A global CSP would break the admin bundle and /static uploads. It has to
    // be configured per deployment instead - see the doc comment.
    expect(
      resolveSecurityHeaders({ isProduction: true, isStaging: false })
    ).not.toHaveProperty("Content-Security-Policy")
  })
})

describe("securityHeaders middleware", () => {
  it("sets the baseline headers on a real response", async () => {
    const app = express()
    // Mirrors express-loader: the framework banner is disabled there, this
    // asserts the two together do not leak the server implementation.
    app.disable("x-powered-by")
    app.use(securityHeaders({ isProduction: false, isStaging: false }))
    app.get("/health", (_req, res) => res.json({ ok: true }))

    const server = await listen(app)

    try {
      const res = await request(server, "/health")

      expect(res.headers["x-content-type-options"]).toBe("nosniff")
      expect(res.headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin"
      )
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN")
      expect(res.headers["strict-transport-security"]).toBeUndefined()
      expect(res.headers["x-powered-by"]).toBeUndefined()
    } finally {
      await close(server)
    }
  })

  it("adds HSTS in production", async () => {
    const app = express()
    app.use(securityHeaders({ isProduction: true, isStaging: false }))
    app.get("/health", (_req, res) => res.json({ ok: true }))

    const server = await listen(app)

    try {
      const res = await request(server, "/health")

      expect(res.headers["strict-transport-security"]).toMatch(/^max-age=\d+$/)
    } finally {
      await close(server)
    }
  })

  it("lets a route handler override a header for a single route", async () => {
    const app = express()
    app.use(securityHeaders({ isProduction: true, isStaging: false }))
    app.get("/embeddable", (_req, res) => {
      res.setHeader("X-Frame-Options", "DENY")
      res.json({ ok: true })
    })

    const server = await listen(app)

    try {
      const res = await request(server, "/embeddable")

      expect(res.headers["x-frame-options"]).toBe("DENY")
    } finally {
      await close(server)
    }
  })
})
