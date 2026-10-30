import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router"

import { ApiError, errorMessage } from "@/api/client"
import { PasswordInput } from "@/components/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"
import { useConfig } from "@/lib/queries"

/** Sign in with a one-time code from the Discord bot (`/reset-password`), then choose a new
 * password on the account page. The bot's DM links here with `?code=`. */
function CodeLogin({ initial, onCancel }: { initial: string; onCancel: () => void }) {
  const { loginWithCode } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState(initial)
  const m = useMutation({
    mutationFn: () => loginWithCode(code.trim()),
    onSuccess: () => navigate("/me", { replace: true }),
  })

  return (
    <div className="mx-auto mt-8 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign in with a code</CardTitle>
          <CardDescription>
            The code from the Discord bot's message (<code>/reset-password</code>). It works once, for 10 minutes; then you
            choose a new password.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            m.mutate()
          }}
        >
          <CardContent className="space-y-4">
            {m.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {m.error instanceof ApiError && m.error.code === "bad_code"
                    ? "That code is wrong, used or expired. Ask the bot for a new one with /reset-password."
                    : errorMessage(m.error)}
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                autoComplete="one-time-code"
                autoFocus={!initial}
                required
                placeholder="XXXX-XXXX"
                className="font-mono uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={m.isPending} autoFocus={!!initial}>
              {m.isPending ? "Signing in…" : "Sign in"}
            </Button>
            <Button type="button" variant="link" size="sm" onClick={onCancel}>
              Log in with a password instead
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

export function LoginPage() {
  const [params, setParams] = useSearchParams()
  const code = params.get("code")
  if (code !== null) return <CodeLogin initial={code} onCancel={() => setParams({}, { replace: true })} />
  return <PasswordLogin onCode={() => setParams({ code: "" })} />
}

function PasswordLogin({ onCode }: { onCode: () => void }) {
  const { session, login } = useAuth()
  const config = useConfig()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const m = useMutation({
    mutationFn: () => login(username.trim(), password),
    onSuccess: (s) => navigate(from ?? (s.scope ? "/players" : "/me"), { replace: true }),
  })

  if (session && !m.isSuccess) return <Navigate to="/me" replace />

  return (
    <div className="mx-auto mt-8 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Log in</CardTitle>
          <CardDescription>With your game account.</CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            m.mutate()
          }}
        >
          <CardContent className="space-y-4">
            {m.error && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(m.error)}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={m.isPending}>
              {m.isPending ? "Logging in…" : "Log in"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Forgot your password?{" "}
              <button type="button" onClick={onCode} className="text-foreground underline underline-offset-4">
                Use a code from Discord
              </button>
            </p>
            {(config.data?.registration === "open" || config.data?.registration === "discord") && (
              <p className="text-sm text-muted-foreground">
                No account?{" "}
                <Link to="/register" className="text-foreground underline underline-offset-4">
                  Create one
                </Link>
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
