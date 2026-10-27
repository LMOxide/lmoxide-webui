import createClient, { type Middleware } from "openapi-fetch"

import type { components, paths } from "./schema"

export type Schemas = components["schemas"]
export type Account = Schemas["Account"]
export type ApiScope = Schemas["ApiScope"]
export type Session = Schemas["Session"]

/** Where the API lives: `VITE_API_URL`, else `/api` on this origin (reverse proxy). */
export const API_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "")

/** An error answer from the API (`{"error": {"code", "message"}}`) or a network failure. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let token: string | null = null
let onUnauthorized: (() => void) | null = null

export function setToken(t: string | null) {
  token = t
}

/** Called when a request with a token answers 401: the session ended or expired. */
export function setUnauthorizedHandler(f: (() => void) | null) {
  onUnauthorized = f
}

const auth: Middleware = {
  onRequest({ request }) {
    if (token) request.headers.set("Authorization", `Bearer ${token}`)
    return request
  },
  async onResponse({ request, response }) {
    // 401 `unauthorized` means the token is no longer valid; others (a wrong current
    // password: `bad_credentials`) are answers to the request itself
    if (response.status === 401 && request.headers.has("Authorization")) {
      const body = await response.clone().json().catch(() => null)
      if (body?.error?.code === "unauthorized") onUnauthorized?.()
    }
    return response
  },
}

export const api = createClient<paths>({ baseUrl: API_URL })
api.use(auth)

type FetchResult<T> = { data?: T; error?: unknown; response: Response }

/** The data of a successful answer; throws `ApiError` otherwise. */
export async function unwrap<T>(p: Promise<FetchResult<T>>): Promise<T> {
  let r: FetchResult<T>
  try {
    r = await p
  } catch {
    throw new ApiError(0, "network", "Can't reach the API server.")
  }
  if (r.response.ok) return r.data as T
  const body = r.error as { error?: { code?: string; message?: string } } | undefined
  throw new ApiError(
    r.response.status,
    body?.error?.code ?? "http_" + r.response.status,
    body?.error?.message ?? r.response.statusText ?? "Request failed",
  )
}

/**
 * A call to a route that isn't in openapi.json (the game server's forwarded routes, e.g. the
 * world content queue `/v1/content/...`); throws `ApiError` like `unwrap`.
 */
export async function raw<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"
  let res: Response
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, "network", "Can't reach the API server.")
  }
  const json = await res.json().catch(() => null)
  if (res.ok) return json as T
  if (res.status === 401 && token && json?.error?.code === "unauthorized") onUnauthorized?.()
  throw new ApiError(res.status, json?.error?.code ?? "http_" + res.status, json?.error?.message ?? res.statusText ?? "Request failed")
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "bad_credentials":
        return "Wrong username or password."
      case "rate_limited":
        return "Too many attempts. Try again in a few minutes."
      case "game_server_unavailable":
        return "The game server is offline."
      case "no_control":
        return "The API isn't connected to the game server."
      default:
        return e.message
    }
  }
  return e instanceof Error ? e.message : String(e)
}
