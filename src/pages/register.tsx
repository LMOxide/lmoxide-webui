import { useMutation } from "@tanstack/react-query"
import { CheckCircle2Icon } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { api, ApiError, errorMessage, unwrap } from "@/api/client"
import { PasswordInput } from "@/components/password-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"
import { DISCORD_INVITE } from "@/lib/discord"
import { useConfig } from "@/lib/queries"
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_HINT, USERNAME_PATTERN } from "@/lib/rules"

export function RegisterPage() {
  const { session, login } = useAuth()
  const config = useConfig()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const mismatch = confirm.length > 0 && confirm !== password
  const m = useMutation({
    mutationFn: async () => {
      await unwrap(api.POST("/v1/auth/register", { body: { username: username.trim(), password } }))
      await login(username.trim(), password)
    },
    onSuccess: () => {
      toast.success("Account created")
      navigate("/me")
    },
  })
  const closed =
    config.data?.registration === "closed" ||
    (m.error instanceof ApiError && m.error.code === "registration_closed")

  if (session)
    return (
      <div className="mx-auto mt-8 max-w-sm">
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>You're logged in</AlertTitle>
          <AlertDescription>
            <Link to="/me" className="underline underline-offset-4">
              Go to your account
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    )

  if (config.data?.registration === "discord")
    return (
      <div className="mx-auto mt-8 max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create an account</CardTitle>
            <CardDescription>Accounts on this server are made in its Discord server.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {DISCORD_INVITE ? "Join the Discord server" : "In the Discord server"}, run <code>/register</code> and fill in
              a username and password. You log in to the game and here with them.
            </p>
            <p className="text-muted-foreground">
              Have an account from before? Log in, then link it with <code>/link</code>.
            </p>
          </CardContent>
          <CardFooter className="mt-2 flex-col gap-3">
            {DISCORD_INVITE && (
              <Button asChild className="w-full">
                <a href={DISCORD_INVITE} target="_blank" rel="noreferrer">
                  Join the Discord server
                </a>
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              Have one?{" "}
              <Link to="/login" className="text-foreground underline underline-offset-4">
                Log in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    )

  return (
    <div className="mx-auto mt-8 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>You log in to the game with the same username and password.</CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!mismatch) m.mutate()
          }}
        >
          <CardContent className="space-y-4">
            {closed ? (
              <Alert variant="destructive">
                <AlertDescription>Registration is closed on this server.</AlertDescription>
              </Alert>
            ) : (
              m.error && (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage(m.error)}</AlertDescription>
                </Alert>
              )
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                pattern={USERNAME_PATTERN}
                title={USERNAME_HINT}
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{USERNAME_HINT}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Repeat password</Label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                required
                aria-invalid={mismatch}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {mismatch && <p className="text-sm text-destructive">The passwords don't match.</p>}
            </div>
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={m.isPending || mismatch || closed}>
              {m.isPending ? "Creating…" : "Create account"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Have one?{" "}
              <Link to="/login" className="text-foreground underline underline-offset-4">
                Log in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
