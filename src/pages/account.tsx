import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BanIcon, KeyRoundIcon, LogOutIcon, PencilIcon, ShieldOffIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { api, errorMessage, unwrap, type Account } from "@/api/client"
import { BanBadge, ErrorAlert, Field, Fields, GmBadge, PageHeader } from "@/components/common"
import { CharactersTable } from "@/components/characters-table"
import { GmLevelSelect } from "@/components/gm-level-select"
import { BanDialog, ConfirmDialog, KickDialog } from "@/components/moderation"
import { PasswordInput } from "@/components/password-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import { formatTime } from "@/lib/format"
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_HINT, USERNAME_PATTERN } from "@/lib/rules"

function EditAccount({ account }: { account: Account }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState(account.username)
  const [gmLevel, setGmLevel] = useState(account.gm_level)
  const m = useMutation({
    mutationFn: () =>
      unwrap(
        api.PATCH("/v1/accounts/{id}", {
          params: { path: { id: account.id } },
          body: {
            username: username.trim() !== account.username ? username.trim() : null,
            gm_level: gmLevel !== account.gm_level ? gmLevel : null,
          },
        }),
      ),
    onSuccess: (a) => {
      setOpen(false)
      toast.success("Saved")
      queryClient.setQueryData(["account", a.id], a)
      queryClient.invalidateQueries({ queryKey: ["accounts"] })
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setUsername(account.username)
          setGmLevel(account.gm_level)
          m.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon data-icon="inline-start" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            m.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit {account.username}</DialogTitle>
            <DialogDescription>A new role takes effect from the account's next login.</DialogDescription>
          </DialogHeader>
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(m.error)}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-username">Username</Label>
            <Input
              id="edit-username"
              required
              autoComplete="off"
              pattern={USERNAME_PATTERN}
              title={USERNAME_HINT}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <GmLevelSelect value={gmLevel} onChange={setGmLevel} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={m.isPending || (username.trim() === account.username && gmLevel === account.gm_level)}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SetPassword({ account }: { account: Account }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const m = useMutation({
    mutationFn: (pw: string | null) =>
      unwrap(api.POST("/v1/accounts/{id}/password", { params: { path: { id: account.id } }, body: { password: pw } })),
    onSuccess: (_, pw) => {
      setOpen(false)
      toast.success(pw == null ? "Password removed" : "Password set")
      queryClient.invalidateQueries({ queryKey: ["account", account.id] })
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setPassword("")
          m.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeyRoundIcon data-icon="inline-start" />
          Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            m.mutate(password)
          }}
        >
          <DialogHeader>
            <DialogTitle>Password for {account.username}</DialogTitle>
            <DialogDescription>
              Ends the account's sessions. Without a password it can't log in at all.
            </DialogDescription>
          </DialogHeader>
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(m.error)}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="set-password">New password</Label>
            <PasswordInput
              id="set-password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={m.isPending || !account.has_password}
              onClick={() => m.mutate(null)}
            >
              Remove password
            </Button>
            <Button type="submit" disabled={m.isPending}>
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AccountPage() {
  const id = Number(useParams().id)
  const { can, account: me } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ["account", id],
    queryFn: () => unwrap(api.GET("/v1/accounts/{id}", { params: { path: { id } } })),
  })
  const a = q.data
  const admin = can("admin")
  // moderators can't kick or ban staff; the server would answer 403
  const canModerate = can("moderate") && a != null && (admin || a.gm_level === 0)

  return (
    <>
      <PageHeader
        title={a?.username ?? "Account"}
        description={a && (
          <span className="flex flex-wrap items-center gap-2">
            <GmBadge level={a.gm_level} />
            {a.id === me?.id && <span>This is you.</span>}
          </span>
        )}
        actions={
          a && (
            <>
              {canModerate && (
                <KickDialog
                  accountId={a.id}
                  name={a.username}
                  trigger={
                    <Button variant="outline">
                      <LogOutIcon data-icon="inline-start" />
                      Kick
                    </Button>
                  }
                />
              )}
              {canModerate &&
                (a.ban ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline">
                        <ShieldOffIcon data-icon="inline-start" />
                        Unban
                      </Button>
                    }
                    title={`Unban ${a.username}?`}
                    description="They can log in again right away."
                    action="Unban"
                    onConfirm={async () => {
                      const r = await unwrap(api.POST("/v1/accounts/{id}/unban", { params: { path: { id: a.id } } }))
                      queryClient.setQueryData(["account", a.id], r)
                      queryClient.invalidateQueries({ queryKey: ["accounts"] })
                      toast.success(`Unbanned ${a.username}`)
                    }}
                  />
                ) : (
                  <BanDialog
                    accountId={a.id}
                    name={a.username}
                    trigger={
                      <Button variant="destructive">
                        <BanIcon data-icon="inline-start" />
                        Ban
                      </Button>
                    }
                  />
                ))}
              {admin && <EditAccount account={a} />}
              {admin && <SetPassword account={a} />}
              {admin && (
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive">
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </Button>
                  }
                  title={`Delete ${a.username}?`}
                  description="This kicks them, then deletes the account with its character and friendships. It can't be undone."
                  action="Delete account"
                  onConfirm={async () => {
                    await unwrap(api.DELETE("/v1/accounts/{id}", { params: { path: { id: a.id } } }))
                    queryClient.removeQueries({ queryKey: ["account", a.id] })
                    queryClient.invalidateQueries({ queryKey: ["accounts"] })
                    toast.success(`Deleted ${a.username}`)
                    navigate("/accounts")
                  }}
                />
              )}
            </>
          )
        }
      />
      {q.error && <ErrorAlert error={q.error} title="Can't load the account" />}
      {q.isPending && <Skeleton className="h-40" />}
      {a && (
        <div className="space-y-6">
          {a.ban && (
            <Alert variant="destructive">
              <BanIcon />
              <AlertTitle>
                Banned {a.ban.until == null ? "permanently" : `until ${formatTime(a.ban.until)}`}
              </AlertTitle>
              {a.ban.reason && <AlertDescription>{a.ban.reason}</AlertDescription>}
            </Alert>
          )}
          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Details <BanBadge ban={a.ban} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Fields>
                  <Field label="Account id">
                    <span className="font-mono">{a.id}</span>
                  </Field>
                  <Field label="GM level">{a.gm_level}</Field>
                  <Field label="Password">
                    {a.has_password ? "Set" : <span className="text-destructive">None: can't log in</span>}
                  </Field>
                  <Field label="Created">{formatTime(a.created_at)}</Field>
                  <Field label="Last game login">{a.last_login_at ? formatTime(a.last_login_at) : "Never"}</Field>
                  {admin && (
                    <Field label="Last login IP">
                      <span className="font-mono">{a.last_login_ip ?? "—"}</span>
                    </Field>
                  )}
                </Fields>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Character</CardTitle>
              </CardHeader>
              <CardContent>
                <CharactersTable characters={a.characters} link />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
