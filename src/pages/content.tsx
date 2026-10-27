import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { errorMessage, raw } from "@/api/client"
import { Empty, ErrorAlert, PageHeader } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatRelative } from "@/lib/format"

// lmoxide docs/WORLD-CONTENT.md: what world editors changed on the survey server waits here
// for approval; the rules say what this server runs and approves without asking.

interface Rules {
  active: string[]
  auto_features: string[]
  auto_authors: string[]
}

interface ContentState {
  source: string | null
  source_error: string | null
  rules: Rules
  revision: number
  pending: number
  pending_records: number
}

interface Item {
  kind: "placement" | "trigger" | "note" | "script"
  id: string
  name: string
  op: "added" | "changed" | "removed"
  details?: string[]
  updated: number
}

interface Change {
  playfield: number
  playfield_name: string | null
  feature: string
  feature_path: string
  author: string
  active: boolean
  summary: string
  items: Item[]
}

interface FeatureRow {
  id: string
  path: string
  comment: string
  copied_from: string | null
}

interface SummaryRow {
  playfield: number
  playfield_name: string | null
  feature: string
  feature_path: string
  active: boolean
  placements: number
  deletions: number
  in_waves: number
  triggers: number
  notes: number
  scripts: number
  authors: string[]
  updated: number
}

const OP_VARIANT = { added: "default", changed: "secondary", removed: "destructive" } as const

function useContentState() {
  return useQuery({ queryKey: ["content", "state"], queryFn: () => raw<ContentState>("GET", "/v1/content/state"), refetchInterval: 15_000 })
}

function Queue() {
  const queryClient = useQueryClient()
  const q = useQuery({ queryKey: ["content", "queue"], queryFn: () => raw<Change[]>("GET", "/v1/content/queue"), refetchInterval: 15_000 })
  const decide = useMutation({
    mutationFn: ({ verb, change, ids }: { verb: "approve" | "reject"; change: Change; ids?: string[] }) =>
      raw<{ records: number }>("POST", `/v1/content/${verb}`, { playfield: change.playfield, feature: change.feature, author: change.author, ids }),
    onSuccess: (r, v) => {
      toast.success(`${v.verb === "approve" ? "Approved" : "Rejected"} ${r.records} record${r.records === 1 ? "" : "s"}`)
      queryClient.invalidateQueries({ queryKey: ["content"] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (q.error) return <ErrorAlert error={q.error} />
  if (!q.data) return <Skeleton className="h-32 w-full" />
  if (!q.data.length) return <Empty>Nothing waiting: the world editors' work is all approved (or rejected).</Empty>
  return (
    <div className="grid gap-4">
      {q.data.map((c) => (
        <Card key={`${c.playfield}|${c.feature}|${c.author}`}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {c.playfield_name ?? `Playfield ${c.playfield}`}
              <Badge variant="outline">{c.feature_path}</Badge>
              {!c.active && (
                <Badge variant="secondary" title="This feature isn't active on this server: approving keeps it for when it is switched on">
                  not active
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              by {c.author || "unknown"} · {c.summary}
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ verb: "approve", change: c })}>
                <CheckIcon data-icon="inline-start" />
                Approve all
              </Button>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ verb: "reject", change: c })}>
                <XIcon data-icon="inline-start" />
                Reject all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>What</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="font-medium">{i.name}</span> <span className="text-xs text-muted-foreground">{i.kind}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={OP_VARIANT[i.op]}>{i.op}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.details?.join(", ")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatRelative(i.updated)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" aria-label="Approve" title="Approve this one" onClick={() => decide.mutate({ verb: "approve", change: c, ids: [i.id] })}>
                        <CheckIcon />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Reject" title="Reject this one" onClick={() => decide.mutate({ verb: "reject", change: c, ids: [i.id] })}>
                        <XIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function toggle(list: string[], id: string, on: boolean) {
  return on ? [...new Set([...list, id])] : list.filter((x) => x !== id)
}

function RulesCard({ rules }: { rules: Rules }) {
  const queryClient = useQueryClient()
  const features = useQuery({ queryKey: ["content", "features"], queryFn: () => raw<FeatureRow[]>("GET", "/v1/content/features") })
  const [draft, setDraft] = useState(rules)
  const [authors, setAuthors] = useState(rules.auto_authors.join(", "))
  const save = useMutation({
    mutationFn: () =>
      raw<Rules>("PUT", "/v1/content/rules", {
        ...draft,
        auto_authors: authors
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("Rules saved")
      queryClient.invalidateQueries({ queryKey: ["content"] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const rows = features.data ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules</CardTitle>
        <CardDescription>
          <b>Active</b>: the features this server runs (nested ones included). <b>Auto-approve</b>: changes to these features, or by these authors, are approved as they come; the rest
          waits above.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {features.error && <ErrorAlert error={features.error} />}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature</TableHead>
              <TableHead className="w-24">Active</TableHead>
              <TableHead className="w-32">Auto-approve</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <span style={{ paddingLeft: `${(f.id.split("/").length - 1) * 16}px` }}>{f.path}</span>
                  {f.copied_from && <span className="ml-2 text-xs text-muted-foreground">copy of {f.copied_from}</span>}
                </TableCell>
                <TableCell>
                  <Switch checked={draft.active.includes(f.id)} onCheckedChange={(on) => setDraft({ ...draft, active: toggle(draft.active, f.id, on) })} />
                </TableCell>
                <TableCell>
                  <Switch checked={draft.auto_features.includes(f.id)} onCheckedChange={(on) => setDraft({ ...draft, auto_features: toggle(draft.auto_features, f.id, on) })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="grid gap-2">
          <Label htmlFor="auto-authors">Auto-approve authors (world editor usernames, comma-separated)</Label>
          <Input id="auto-authors" value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="e.g. blake, hosttemple" />
        </div>
        <div>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save rules
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Summary() {
  const [of, setOf] = useState<"approved" | "working">("approved")
  const q = useQuery({ queryKey: ["content", "summary", of], queryFn: () => raw<{ rows: SummaryRow[] }>("GET", `/v1/content/summary?of=${of}`) })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Content</CardTitle>
        <CardDescription>What the approved copy (this server's) or the world editor's working copy holds, per world and feature.</CardDescription>
        <Tabs value={of} onValueChange={(v) => setOf(v as typeof of)}>
          <TabsList>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="working">Working (world editor)</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {q.error && <ErrorAlert error={q.error} />}
        {!q.data ? (
          <Skeleton className="h-24 w-full" />
        ) : !q.data.rows.length ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>World</TableHead>
                <TableHead>Feature</TableHead>
                <TableHead className="text-right">Placed</TableHead>
                <TableHead className="text-right">Guesses deleted</TableHead>
                <TableHead className="text-right">In waves</TableHead>
                <TableHead className="text-right">Walls</TableHead>
                <TableHead className="text-right">Notes / scripts</TableHead>
                <TableHead>Authors</TableHead>
                <TableHead>Last change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.rows.map((r) => (
                <TableRow key={`${r.playfield}|${r.feature}`}>
                  <TableCell>{r.playfield_name ?? r.playfield}</TableCell>
                  <TableCell>
                    {r.feature_path} {!r.active && <Badge variant="secondary">not active</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{r.placements}</TableCell>
                  <TableCell className="text-right">{r.deletions}</TableCell>
                  <TableCell className="text-right">{r.in_waves}</TableCell>
                  <TableCell className="text-right">{r.triggers}</TableCell>
                  <TableCell className="text-right">
                    {r.notes} / {r.scripts}
                  </TableCell>
                  <TableCell className="text-sm">{r.authors.join(", ")}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatRelative(r.updated)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function ContentPage() {
  const queryClient = useQueryClient()
  const state = useContentState()
  const refresh = useMutation({
    mutationFn: () => raw<ContentState>("POST", "/v1/content/refresh"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content"] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <div className="grid gap-6">
      <PageHeader
        title="World content"
        description={
          state.data
            ? `${state.data.pending} change${state.data.pending === 1 ? "" : "s"} (${state.data.pending_records} records) waiting · from ${state.data.source ?? "no world editor (only approved content)"}`
            : "What the world editors changed, waiting for approval, and what this server runs."
        }
        actions={
          <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCwIcon data-icon="inline-start" />
            Check now
          </Button>
        }
      />
      {state.error && <ErrorAlert error={state.error} />}
      {state.data?.source_error && (
        <Alert variant="destructive">
          <AlertTitle>The world editor's content can't be read</AlertTitle>
          <AlertDescription>{state.data.source_error}</AlertDescription>
        </Alert>
      )}
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-semibold">Waiting for approval</h2>
        <Queue />
      </section>
      {/* (keyed: saved rules start a fresh draft) */}
      {state.data && <RulesCard key={JSON.stringify(state.data.rules)} rules={state.data.rules} />}
      <Summary />
    </div>
  )
}
