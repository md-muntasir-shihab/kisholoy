import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { dynamicImport } from "@medusajs/utils"
import createStore from "connect-redis"
import cookieParser from "cookie-parser"
import express, { Express, RequestHandler } from "express"
import session from "express-session"
import Redis from "ioredis"
import morgan from "morgan"
import path from "path"
import { configManager } from "../config"
import { MedusaRequest, MedusaResponse } from "./types"

const NOISY_ENDPOINTS_CHUNKS = ["@fs", "@id", "@vite", "@react", "node_modules"]

const isHealthCheck = (req: MedusaRequest) => req.path === "/health"

/**
 * Query string parameters whose values must never appear in HTTP access logs.
 *
 * Single-use secrets such as the admin invite token are transported as URL
 * query parameters (e.g. `POST /admin/invites/accept?token=...`), and the
 * `Referer` header can also carry them (e.g. navigation from `/invite?token=...`).
 * Morgan logs the full URL and referrer by default, so we redact these values.
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  "token",
  "invite_token",
  "auth_token",
  "code",
  "password",
])

/**
 * Replaces the values of known-sensitive query parameters with `[REDACTED]`,
 * preserving the rest of the URL byte-for-byte.
 */
export function redactSensitiveQueryParams(url: string): string {
  const queryStart = url.indexOf("?")
  if (queryStart === -1) {
    return url
  }

  const path = url.slice(0, queryStart + 1)
  const query = url.slice(queryStart + 1)
  if (!query) {
    return url
  }

  const redacted = query.split("&").map((pair) => {
    const separatorIndex = pair.indexOf("=")
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex)

    let key = rawKey
    try {
      key = decodeURIComponent(rawKey)
    } catch {
      // Keep the raw key if it is not valid percent-encoding.
    }

    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
      return `${rawKey}=[REDACTED]`
    }
    return pair
  })

  return path + redacted.join("&")
}

/**
 * Resolves the `sameSite` and `secure` flags used for the session cookie.
 *
 * In production/staging the cookie must be `Secure`, but `sameSite` is kept
 * at `"lax"` rather than `"none"` to prevent CSRF: `SameSite=none` allows the
 * cookie to be attached to cross-site POSTs from a malicious page, which is
 * the root cause of GHSA-jhvc-qx3m-6r3q.
 */
export function resolveSessionCookieSecurity({
  isProduction,
  isStaging,
}: {
  isProduction: boolean
  isStaging: boolean
}): { sameSite: "lax" | boolean; secure: boolean } {
  if (isProduction || isStaging) {
    return { sameSite: "lax", secure: true }
  }
  return { sameSite: false, secure: false }
}

export async function expressLoader({
  app,
  container,
}: {
  app: Express
  container: MedusaContainer
}): Promise<{
  app: Express
  shutdown: () => Promise<void>
}> {
  const baseDir = configManager.baseDir
  const configModule = configManager.config
  const isProduction = configManager.isProduction
  const NODE_ENV = process.env.NODE_ENV || "development"
  const IS_DEV = NODE_ENV.startsWith("dev")
  const isStaging = NODE_ENV === "staging"
  const isTest = NODE_ENV === "test"
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const { sameSite, secure } = resolveSessionCookieSecurity({
    isProduction,
    isStaging,
  })

  const { http, sessionOptions, cookieOptions } = configModule.projectConfig
  const sessionOpts = {
    name: sessionOptions?.name ?? "connect.sid",
    resave: sessionOptions?.resave ?? true,
    rolling: sessionOptions?.rolling ?? false,
    saveUninitialized: sessionOptions?.saveUninitialized ?? false,
    proxy: true,
    secret: sessionOptions?.secret ?? http?.cookieSecret,
    cookie: {
      sameSite,
      secure,
      // Explicitly set httpOnly (also the express-session default) so the
      // session id is never readable from client-side JavaScript.
      httpOnly: true,
      maxAge: sessionOptions?.ttl ?? 10 * 60 * 60 * 1000,
      ...cookieOptions,
    },
    store: null,
  }

  let redisClient: Redis

  if (configModule?.projectConfig.sessionOptions?.dynamodbOptions) {
    const storeFactory = await dynamicImport("connect-dynamodb")
    const client = await dynamicImport("@aws-sdk/client-dynamodb")
    const DynamoDBStore = storeFactory({ session })
    sessionOpts.store = new DynamoDBStore({
      ...configModule.projectConfig.sessionOptions.dynamodbOptions,
      client: new client.DynamoDBClient(
        configModule.projectConfig.sessionOptions.dynamodbOptions.clientOptions
      ),
    })
  } else if (configModule?.projectConfig?.redisUrl) {
    const RedisStore = createStore(session)
    redisClient = new Redis(
      configModule.projectConfig.redisUrl,
      configModule.projectConfig.redisOptions ?? {}
    )
    sessionOpts.store = new RedisStore({
      client: redisClient,
      prefix: `${configModule?.projectConfig?.redisPrefix ?? ""}sess:`,
    })
  }

  app.set("trust proxy", 1)

  // Avoid disclosing the backend framework via the `X-Powered-By` header.
  app.disable("x-powered-by")

  /**
   * Method to skip logging HTTP requests. We skip in test environment
   * and also exclude files served by vite during development
   */
  function shouldSkipHttpLog(req: MedusaRequest, res: MedusaResponse) {
    return (
      isTest ||
      isHealthCheck(req) ||
      NOISY_ENDPOINTS_CHUNKS.some((chunk) => req.url.includes(chunk)) ||
      !logger.shouldLog("http")
    )
  }

  let loggingMiddleware: RequestHandler

  // Custom morgan tokens that redact single-use secrets (e.g. invite tokens)
  // transported as URL query parameters before they reach the access logs.
  morgan.token("sanitized-url", (req) => {
    const { originalUrl, url } = req as unknown as {
      originalUrl?: string
      url?: string
    }
    return redactSensitiveQueryParams(originalUrl ?? url ?? "")
  })
  morgan.token("sanitized-referrer", (req) => {
    const headers = (req as unknown as { headers?: Record<string, string> })
      .headers
    return redactSensitiveQueryParams(
      headers?.referrer ?? headers?.referer ?? "-"
    )
  })

  /**
   * The middleware to use for logging. We write the log messages
   * using winston, but rely on morgan to hook into HTTP requests
   */
  if (!IS_DEV) {
    const jsonFormat = (tokens, req, res) => {
      const result = {
        level: "http",
        // client ip
        client_ip: req.ip || "-",

        // Request ID can be correlated with other logs (like error reports)
        request_id: req.requestId || "-",

        // Standard HTTP request properties
        http_version: tokens["http-version"](req, res),
        method: tokens.method(req, res),
        path: redactSensitiveQueryParams(tokens.url(req, res)),

        // Response details
        status: Number(tokens.status(req, res)),
        response_size: tokens.res(req, res, "content-length") || 0,
        request_size: tokens.req(req, res, "content-length") || 0,
        duration: Number(tokens["response-time"](req, res)),

        // Useful headers that might help in debugging or tracing
        referrer: redactSensitiveQueryParams(tokens.referrer(req, res) || "-"),
        user_agent: tokens["user-agent"](req, res),

        timestamp: new Date().toISOString(),
      }

      return JSON.stringify(result)
    }

    loggingMiddleware = morgan(jsonFormat, {
      skip: shouldSkipHttpLog,
    })
  } else {
    loggingMiddleware = morgan(
      ":method :sanitized-url ← :sanitized-referrer (:status) - :response-time ms",
      {
        skip: shouldSkipHttpLog,
        stream: {
          write: (message: string) => logger.http(message.trim()),
        },
      }
    )
  }

  app.use(loggingMiddleware)
  app.use(cookieParser())
  app.use(session(sessionOpts))

  // Currently we don't allow configuration of static files, but this can be revisited as needed.
  app.use("/static", express.static(path.join(baseDir, "static")))

  const shutdown = async () => {
    redisClient?.disconnect()
  }

  return { app, shutdown }
}
