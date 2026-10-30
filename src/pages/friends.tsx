import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { api, ApiError, errorMessage, unwrap, type Schemas } from "@/api/client"
import { Empty, ErrorAlert, PageHeader } from "@/components/common"
import { ConfirmDialog } from "@/components/moderation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRelative, formatTime } from "@/lib/format"

type Friend = Schemas["AccountFriend"]

const FRIENDS = ["me", "friends"] as const

/** Ask an account by its username. */
function AskFriend() {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const m = useMutation({
    mutationFn: () => unwrap(api.POST("/v1/me/friends", { body: { username: username.trim() } })),
    onSuccess: (f) => {
      queryClient.invalidateQueries({ queryKey: FRIENDS })
      setUsername("")
      toast.success(f.state === "friends" ? `${f.username} had asked you already: you are friends now` : `Asked ${f.username}`)
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a friend account</CardTitle>
        <CardDescription>
          Once they accept, all your characters are friends with all of theirs in game, and characters either of you makes
          later too. If they linked Discord, the bot asks them there.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            m.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="friend-username">Their username</Label>
            <Input id="friend-username" required autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <Button type="submit" disabled={m.isPending || username.trim() === ""}>
            <UserPlusIcon data-icon="inline-start" />
            {m.isPending ? "Asking…" : "Ask"}
          </Button>
        </form>
        {m.error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              {m.error instanceof ApiError && m.error.status === 404
                ? "There's no account with that username (it's the login name, not a character's name)."
                : errorMessage(m.error)}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function FriendRow({ f }: { f: Friend }) {
  const queryClient = useQueryClient()
  const done = (message: string) => () => {
    queryClient.invalidateQueries({ queryKey: FRIENDS })
    toast.success(message)
  }
  const onError = (e: unknown) => toast.error(errorMessage(e))
  const accept = useMutation({
    mutationFn: () => unwrap(api.POST("/v1/me/friends/{account_id}/accept", { params: { path: { account_id: f.account_id } } })),
    onSuccess: done(`You and ${f.username} are friends now`),
    onError,
  })
  const reject = useMutation({
    mutationFn: () => unwrap(api.POST("/v1/me/friends/{account_id}/reject", { params: { path: { account_id: f.account_id } } })),
    onSuccess: done(`Turned down ${f.username}`),
    onError,
  })
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE("/v1/me/friends/{account_id}", { params: { path: { account_id: f.account_id } } })),
    onSuccess: done(f.state === "friends" ? `No longer friends with ${f.username}` : `Withdrew the request to ${f.username}`),
    onError,
  })
  const busy = accept.isPending || reject.isPending || remove.isPending
  const when = f.state === "friends" ? f.accepted_at : f.requested_at
  return (
    <TableRow>
      <TableCell className="font-medium">{f.username}</TableCell>
      <TableCell title={formatTime(when)}>{formatRelative(when)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {f.state === "incoming" && (
            <>
              <Button size="sm" disabled={busy} onClick={() => accept.mutate()}>
                <CheckIcon data-icon="inline-start" /> Accept
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => reject.mutate()}>
                <XIcon data-icon="inline-start" /> Reject
              </Button>
            </>
          )}
          {f.state === "outgoing" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => remove.mutate()}>
              Withdraw
            </Button>
          )}
          {f.state === "friends" && (
            <ConfirmDialog
              title={`Stop being friends with ${f.username}?`}
              description="Your characters and theirs stop being friends in game (also ones you befriended there yourselves)."
              action="Remove"
              onConfirm={() => remove.mutateAsync()}
              trigger={
                <Button size="sm" variant="outline" disabled={busy}>
                  Remove
                </Button>
              }
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function FriendTable({ title, description, list, when, empty }: { title: string; description?: string; list: Friend[]; when: string; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <Empty>{empty}</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>{when}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((f) => (
                <FriendRow key={f.account_id} f={f} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function FriendsPage() {
  const friends = useQuery({ queryKey: FRIENDS, queryFn: () => unwrap(api.GET("/v1/me/friends")), refetchInterval: 30_000 })
  const list = friends.data ?? []
  const incoming = list.filter((f) => f.state === "incoming")
  const outgoing = list.filter((f) => f.state === "outgoing")
  const accepted = list.filter((f) => f.state === "friends")
  return (
    <>
      <PageHeader title="Friends" description="Friend accounts: all your characters are friends with all of theirs." />
      {friends.error && <ErrorAlert error={friends.error} />}
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          {friends.isPending ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              {incoming.length > 0 && <FriendTable title="Asking you" list={incoming} when="Asked" empty="" />}
              <FriendTable title="Friend accounts" list={accepted} when="Since" empty="No friend accounts yet." />
              {outgoing.length > 0 && <FriendTable title="Waiting for an answer" description="Requests you sent." list={outgoing} when="Asked" empty="" />}
            </>
          )}
        </div>
        <div className="space-y-6">
          <AskFriend />
        </div>
      </div>
    </>
  )
}
