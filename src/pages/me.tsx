import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { api, ApiError, errorMessage, unwrap, type Account } from "@/api/client"
import { BanBadge, ErrorAlert, Field, Fields, GmBadge, PageHeader } from "@/components/common"
import { CharactersTable } from "@/components/characters-table"
import { PasswordInput } from "@/components/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import { formatTime } from "@/lib/format"
import { useConfig, useGmLevels } from "@/lib/queries"
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_HINT, USERNAME_PATTERN } from "@/lib/rules"

function ChangePassword() {
  const { clear, session } = useAuth()
  // signed in with a code from the Discord bot: no current password needed
  const reset = session?.password_reset === true
  const navigate = useNavigate()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const mismatch = confirm.length > 0 && confirm !== next
  const m = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/me/password", {
          body: reset ? { new_password: next } : { current_password: current, new_password: next },
        }),
      ),
    onSuccess: () => {
      // the server ended every session of this account, this one too
      clear()
      toast.success("Password changed. Log in again with the new one.")
      navigate("/login")
    },
  })

  return (
    <Card className={reset ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle>{reset ? "Choose a new password" : "Change password"}</CardTitle>
        <CardDescription>
          {reset
            ? "You signed in with a code from Discord. This sets your password and logs you out everywhere."
            : "This logs you out everywhere, including the game."}
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!mismatch) m.mutate()
        }}
      >
        <CardContent className="space-y-4">
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {m.error instanceof ApiError && m.error.code === "bad_credentials"
                  ? "The current password is wrong."
                  : errorMessage(m.error)}
              </AlertDescription>
            </Alert>
          )}
          {!reset && (
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <PasswordInput
                id="current"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new">New password</Label>
            <PasswordInput id="new" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} required value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Repeat new password</Label>
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
        <CardFooter className="mt-6">
          <Button type="submit" disabled={m.isPending || mismatch}>
            {m.isPending ? "Changing…" : "Change password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

/** The account's own login name, once every `username_cooldown_days` (admins any time). */
function ChangeUsername({ account }: { account: Account }) {
  const { session, setAccount } = useAuth()
  const queryClient = useQueryClient()
  const days = useConfig().data?.username_cooldown_days ?? 7
  const gm = useGmLevels()
  // no password to check: a Discord sign-in code's session, or an account without one
  const needsPassword = account.has_password && session?.password_reset !== true
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  // (the time the page opened: a wait of days doesn't need to tick)
  const [now] = useState(() => Date.now() / 1000)
  const next = account.gm_level >= gm.admin || account.username_changed_at == null ? null : account.username_changed_at + days * 86400
  const waiting = next != null && next > now
  const m = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/me/username", {
          body: { new_username: username.trim(), current_password: needsPassword ? password : null },
        }),
      ),
    onSuccess: (a) => {
      queryClient.setQueryData(["me"], a)
      setAccount(a)
      setUsername("")
      setPassword("")
      toast.success(`Your username is ${a.username} now. Log in to the game with it.`)
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change username</CardTitle>
        <CardDescription>
          The name you log in with (your characters keep theirs). Once every {days} day{days === 1 ? "" : "s"}; saved logins
          such as the patcher's need the new one.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate()
        }}
      >
        <CardContent className="space-y-4">
          {waiting && (
            <Alert>
              <AlertDescription>You changed it recently. You can change it again from {formatTime(next)}.</AlertDescription>
            </Alert>
          )}
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {m.error instanceof ApiError && m.error.code === "bad_credentials"
                  ? "The current password is wrong."
                  : m.error instanceof ApiError && m.error.status === 409
                    ? "That username is taken."
                    : errorMessage(m.error)}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-username">New username</Label>
            <Input
              id="new-username"
              required
              autoComplete="username"
              pattern={USERNAME_PATTERN}
              title={USERNAME_HINT}
              disabled={waiting}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          {needsPassword && (
            <div className="space-y-2">
              <Label htmlFor="username-password">Current password</Label>
              <PasswordInput
                id="username-password"
                autoComplete="current-password"
                required
                disabled={waiting}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="mt-6">
          <Button type="submit" disabled={m.isPending || waiting || username.trim() === "" || username.trim() === account.username}>
            {m.isPending ? "Changing…" : "Change username"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

/** The Discord account this one is linked to, or a box for the bot's `/link` code (the bot's DM
 * links here with `?link_code=`). */
function DiscordLink({ account }: { account: Account }) {
  const { setAccount } = useAuth()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [code, setCode] = useState(params.get("link_code") ?? "")
  const m = useMutation({
    mutationFn: () => unwrap(api.POST("/v1/me/discord", { body: { code: code.trim() } })),
    onSuccess: (a) => {
      queryClient.setQueryData(["me"], a)
      setAccount(a)
      setParams({}, { replace: true })
      toast.success("Linked to your Discord account")
    },
  })

  if (account.discord_id)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discord</CardTitle>
          <CardDescription>
            Linked to Discord account <span className="font-mono">{account.discord_id}</span>. Your roles in the Discord
            server set your GM level, and <code>/reset-password</code> there sends you a sign-in code.
          </CardDescription>
        </CardHeader>
      </Card>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link Discord</CardTitle>
        <CardDescription>
          Run <code>/link</code> in the Discord server; the bot sends you a code by DM. Enter it here.
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
                  ? "That code is wrong, used or expired. Run /link again for a new one."
                  : errorMessage(m.error)}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="link-code">Code</Label>
            <Input
              id="link-code"
              autoComplete="one-time-code"
              required
              placeholder="XXXX-XXXX"
              className="font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="mt-6">
          <Button type="submit" disabled={m.isPending}>
            {m.isPending ? "Linking…" : "Link"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export function MePage() {
  const { can, setAccount } = useAuth()
  const me = useQuery({ queryKey: ["me"], queryFn: () => unwrap(api.GET("/v1/me")) })
  useEffect(() => {
    if (me.data) setAccount(me.data)
  }, [me.data, setAccount])
  const a = me.data

  return (
    <>
      <PageHeader title="My account" />
      {me.error && <ErrorAlert error={me.error} />}
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {a ? a.username : <Skeleton className="h-5 w-32" />}
                {a && <GmBadge level={a.gm_level} />}
                {a && <BanBadge ban={a.ban} />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {a ? (
                <Fields>
                  <Field label="Account id">
                    <span className="font-mono">{a.id}</span>
                  </Field>
                  <Field label="Created">{formatTime(a.created_at)}</Field>
                  <Field label="Last game login">{a.last_login_at ? formatTime(a.last_login_at) : "Never"}</Field>
                </Fields>
              ) : (
                <Skeleton className="h-16" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Characters</CardTitle>
            </CardHeader>
            <CardContent>{a ? <CharactersTable characters={a.characters} link={can("read")} /> : <Skeleton className="h-16" />}</CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          {a ? <ChangeUsername account={a} /> : <Skeleton className="h-40" />}
          <ChangePassword />
          {a ? <DiscordLink account={a} /> : <Skeleton className="h-40" />}
        </div>
      </div>
    </>
  )
}
