import { createContext, useContext } from "react"

import type { Account, ApiScope, Session } from "@/api/client"

const SCOPES: ApiScope[] = ["read", "moderate", "discord", "admin"]

export type AuthState = {
  session: Session | null
  account: Account | null
  /** Whether the session's scope includes `scope` (each scope includes the ones before it). */
  can: (scope: ApiScope) => boolean
  login: (username: string, password: string) => Promise<Session>
  /** Sign in with a one-time code the Discord bot sent (`/reset-password`). */
  loginWithCode: (code: string) => Promise<Session>
  logout: () => Promise<void>
  /** Forget the session locally (it already ended on the server). */
  clear: () => void
  setAccount: (a: Account) => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function scopeIncludes(have: ApiScope | null | undefined, need: ApiScope) {
  return have != null && SCOPES.indexOf(have) >= SCOPES.indexOf(need)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth outside AuthProvider")
  return ctx
}
