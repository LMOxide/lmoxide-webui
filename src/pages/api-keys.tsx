import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, CopyIcon, PlusIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { api, errorMessage, unwrap, type ApiScope, type Schemas } from "@/api/client"
import { Empty, ErrorAlert, PageHeader } from "@/components/common"
import { ConfirmDialog } from "@/components/moderation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRelative, formatTime } from "@/lib/format"

const SCOPES: [ApiScope, string][] = [
  ["read", "read: status, players, accounts, characters"],
  ["moderate", "moderate: + kick, ban, unban, broadcast"],
  ["admin", "admin: everything"],
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("Couldn't copy; select the text instead.")
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

function CreateKey() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<ApiScope>("read")
  const m = useMutation({
    mutationFn: () => unwrap(api.POST("/v1/api-keys", { body: { name: name.trim(), scope } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName("")
          setScope("read")
          m.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          New key
        </Button>
      </DialogTrigger>
      <DialogContent>
        {m.data ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Key "{m.data.key.name}" created</DialogTitle>
              <DialogDescription>Send it as <code>Authorization: Bearer &lt;secret&gt;</code>.</DialogDescription>
            </DialogHeader>
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>Copy the secret now</AlertTitle>
              <AlertDescription>It isn't shown again.</AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Input readOnly className="font-mono text-xs" value={m.data.secret} onFocus={(e) => e.target.select()} />
              <CopyButton text={m.data.secret} />
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              m.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>For a bot or a script.</DialogDescription>
            </DialogHeader>
            {m.error && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(m.error)}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input id="key-name" required placeholder="discord-bot" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as ApiScope)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map(([s, label]) => (
                    <SelectItem key={s} value={s}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={m.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ScopeBadge({ scope }: { scope: ApiScope }) {
  return <Badge variant={scope === "admin" ? "default" : scope === "moderate" ? "secondary" : "outline"}>{scope}</Badge>
}

export function ApiKeysPage() {
  const queryClient = useQueryClient()
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => unwrap(api.GET("/v1/api-keys")) })
  const [showRevoked, setShowRevoked] = useState(false)
  const list = (keys.data ?? []).filter((k) => showRevoked || !k.revoked)
  const revokedCount = (keys.data ?? []).filter((k) => k.revoked).length

  const revoke = async (k: Schemas["ApiKey"]) => {
    await unwrap(api.DELETE("/v1/api-keys/{id}", { params: { path: { id: k.id } } }))
    toast.success(`Revoked ${k.name}`)
    await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
  }

  return (
    <>
      <PageHeader title="API keys" description="Credentials for bots and scripts." actions={<CreateKey />} />
      {keys.error ? (
        <ErrorAlert error={keys.error} title="Can't load the keys" />
      ) : (
        <Card>
          <CardContent>
            {!keys.data ? (
              <Skeleton className="h-24" />
            ) : list.length === 0 ? (
              <Empty>No API keys.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((k) => (
                    <TableRow key={k.id} className={k.revoked ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-medium">
                        {k.name} {k.revoked && <Badge variant="outline">revoked</Badge>}
                      </TableCell>
                      <TableCell>
                        <ScopeBadge scope={k.scope} />
                      </TableCell>
                      <TableCell title={formatTime(k.created_at)}>{formatRelative(k.created_at)}</TableCell>
                      <TableCell title={formatTime(k.last_used_at)}>
                        {k.last_used_at ? formatRelative(k.last_used_at) : "Never"}
                      </TableCell>
                      <TableCell>
                        {!k.revoked && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="sm" className="text-destructive">
                                Revoke
                              </Button>
                            }
                            title={`Revoke ${k.name}?`}
                            description="Anything using this key stops working right away."
                            action="Revoke"
                            onConfirm={() => revoke(k)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      {revokedCount > 0 && (
        <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => setShowRevoked((s) => !s)}>
          {showRevoked ? "Hide" : "Show"} {revokedCount} revoked
        </Button>
      )}
    </>
  )
}
