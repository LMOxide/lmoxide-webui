import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router"

import { errorMessage } from "@/api/client"
import { PasswordInput } from "@/components/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"
import { useConfig } from "@/lib/queries"

export function LoginPage() {
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
            {config.data?.registration_open && (
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
