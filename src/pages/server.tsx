import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MegaphoneIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { api, errorMessage, unwrap } from "@/api/client"
import { ErrorAlert, PageHeader } from "@/components/common"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth-context"
import { useStatus } from "@/lib/queries"
import { BROADCAST_MAX, BROADCAST_MIN } from "@/lib/rules"

function Broadcast() {
  const [message, setMessage] = useState("")
  const m = useMutation({
    mutationFn: () => unwrap(api.POST("/v1/broadcast", { body: { message: message.trim() } })),
    onSuccess: (r) => {
      setMessage("")
      toast.success(`Sent to ${r.affected} player${r.affected === 1 ? "" : "s"}`)
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Broadcast</CardTitle>
        <CardDescription>A chat line from "Server" to everyone online.</CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate()
        }}
      >
        <CardContent className="space-y-2">
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(m.error)}</AlertDescription>
            </Alert>
          )}
          <Textarea
            rows={3}
            required
            minLength={BROADCAST_MIN}
            maxLength={BROADCAST_MAX}
            placeholder="The server restarts in 10 minutes."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {message.length}/{BROADCAST_MAX}
          </p>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={m.isPending || !message.trim()}>
            <MegaphoneIcon data-icon="inline-start" />
            Send
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function Maintenance() {
  const queryClient = useQueryClient()
  const status = useStatus()
  // what's typed, else the message in force
  const [draft, setDraft] = useState<string | null>(null)
  const message = draft ?? status.data?.maintenance_message ?? ""
  const on = status.data?.maintenance ?? false
  const m = useMutation({
    mutationFn: (enabled: boolean) =>
      unwrap(api.POST("/v1/maintenance", { body: { enabled, message: message.trim() || null } })),
    onSuccess: (s) => {
      setDraft(null)
      queryClient.setQueryData(["status"], s)
      toast.success(s.maintenance ? "Maintenance mode on" : "Maintenance mode off")
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance mode</CardTitle>
        <CardDescription>While it's on, only accounts with a GM level can log in to the game.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.error && <ErrorAlert error={status.error} />}
        {m.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(m.error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor="maintenance">{on ? "On" : "Off"}</Label>
          <Switch
            id="maintenance"
            checked={on}
            disabled={!status.data?.game_server_online || m.isPending}
            onCheckedChange={(v) => m.mutate(v)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maintenance-message">Message for players (optional)</Label>
          <Input
            id="maintenance-message"
            placeholder="Back in an hour"
            value={message}
            onChange={(e) => setDraft(e.target.value)}
          />
          {on && message.trim() !== (status.data?.maintenance_message ?? "") && (
            <Button variant="outline" size="sm" disabled={m.isPending} onClick={() => m.mutate(true)}>
              Update message
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ServerPage() {
  const { can } = useAuth()
  const status = useStatus()
  return (
    <>
      <PageHeader title="Server" />
      {status.data && !status.data.game_server_online && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>The game server is offline, so these won't work right now.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Broadcast />
        {can("admin") && <Maintenance />}
      </div>
    </>
  )
}
