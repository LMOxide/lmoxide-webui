import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { api, ApiError, errorMessage, unwrap } from "@/api/client"
import { BanBadge, ErrorAlert, Field, Fields, GmBadge, PageHeader } from "@/components/common"
import { CharactersTable } from "@/components/characters-table"
import { PasswordInput } from "@/components/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import { formatTime } from "@/lib/format"
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/rules"

function ChangePassword() {
  const { clear } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const mismatch = confirm.length > 0 && confirm !== next
  const m = useMutation({
    mutationFn: () =>
      unwrap(api.POST("/v1/me/password", { body: { current_password: current, new_password: next } })),
    onSuccess: () => {
      // the server ended every session of this account, this one too
      clear()
      toast.success("Password changed. Log in again with the new one.")
      navigate("/login")
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>This logs you out everywhere, including the game.</CardDescription>
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
        <ChangePassword />
      </div>
    </>
  )
}
