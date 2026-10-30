import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { api, setToken, setUnauthorizedHandler, unwrap, type Account, type Session } from "@/api/client"
import { AuthContext, scopeIncludes, type AuthState } from "@/lib/auth-context"

const STORAGE_KEY = "lmoxide.session"

function load(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Session | null
    if (s && s.expires_at * 1000 > Date.now()) return s
  } catch {
    // unreadable or blocked storage: start logged out
  }
  return null
}

function store(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // the session then lasts until the page is reloaded
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(() => {
    const s = load()
    setToken(s?.token ?? null)
    return s
  })

  const apply = useCallback(
    (s: Session | null) => {
      setToken(s?.token ?? null)
      store(s)
      setSession(s)
      queryClient.clear()
    },
    [queryClient],
  )

  const clear = useCallback(() => apply(null), [apply])

  const setAccount = useCallback((account: Account) => {
    setSession((s) => {
      if (!s) return s
      const next = { ...s, account }
      store(next)
      return next
    })
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(clear)
    return () => setUnauthorizedHandler(null)
  }, [clear])

  // log out when the token expires while the page is open
  useEffect(() => {
    if (!session) return
    const ms = session.expires_at * 1000 - Date.now()
    const t = setTimeout(clear, Math.max(0, Math.min(ms, 2 ** 31 - 1)))
    return () => clearTimeout(t)
  }, [session, clear])

  const value = useMemo<AuthState>(
    () => ({
      session,
      account: session?.account ?? null,
      can: (scope) => scopeIncludes(session?.scope, scope),
      login: async (username, password) => {
        const s = await unwrap(api.POST("/v1/auth/login", { body: { username, password } }))
        apply(s)
        return s
      },
      loginWithCode: async (code) => {
        const s = await unwrap(api.POST("/v1/auth/code", { body: { code } }))
        apply(s)
        return s
      },
      logout: async () => {
        try {
          await unwrap(api.POST("/v1/auth/logout"))
        } finally {
          apply(null)
        }
      },
      clear,
      setAccount,
    }),
    [session, apply, clear, setAccount],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
