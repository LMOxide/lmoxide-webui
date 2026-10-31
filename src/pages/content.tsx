import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, FilterXIcon, XIcon } from "lucide-react"
import { Fragment, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { errorMessage, raw } from "@/api/client"
import { Empty, ErrorAlert, PageHeader } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRelative } from "@/lib/format"

// lmoxide docs/WORLD-CONTENT.md: what world editors publish waits in this server's queue;
// approving will commit an entry to the content repository (not built on the server yet).

interface ContentState {
  /** the content tree this server runs */
  content: string | null
  /** the publish queue's directory (none: this server has no queue) */
  queue: string | null
  /** entries waiting */
  queued: number | null
}

type Op = "added" | "changed" | "removed"

interface QueuedRecord {
  id: string
  feature: string
  change: Op
  /** relative to the content tree */
  file: string
  author: string
  before: unknown
  after: unknown
}

interface Entry {
  seq: number
  created: number
  by: string
  summary: string
  status: "queued" | "rejected" | "approved"
  reason?: string
  records: QueuedRecord[]
}

const OP_VARIANT = { added: "default", changed: "secondary", removed: "destructive" } as const
const STATUS_VARIANT = { queued: "outline", rejected: "destructive", approved: "default" } as const
const OPS: Op[] = ["added", "changed", "removed"]
const STATUSES: Entry["status"][] = ["queued", "rejected", "approved"]

/** Until the server builds approving (it answers 501). */
const APPROVE_MISSING = "Approving (committing to the content repository) isn't built on the server yet"

// ------------------------------------------------------------------ filters

/** What the queue shows (kept in the page's URL, so it can be shared). */
interface Filter {
  /** words anywhere: summaries, record ids, files, features, authors */
  q: string
  status: "" | Entry["status"]
  op: "" | Op
}

function useFilter(): [Filter, (f: Partial<Filter>) => void, () => void] {
  const [params, setParams] = useSearchParams()
  const filter: Filter = {
    q: params.get("q") ?? "",
    status: (STATUSES as string[]).includes(params.get("status") ?? "") ? (params.get("status") as Entry["status"]) : "",
    op: (OPS as string[]).includes(params.get("op") ?? "") ? (params.get("op") as Op) : "",
  }
  const set = (f: Partial<Filter>) => {
    const next = { ...filter, ...f }
    const p = new URLSearchParams()
    for (const k of ["q", "status", "op"] as const) if (next[k]) p.set(k, next[k])
    setParams(p, { replace: true })
  }
  return [filter, set, () => setParams(new URLSearchParams(), { replace: true })]
}

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase()
const words = (q: string) => lower(q).split(/\s+/).filter(Boolean)
const hasWords = (ws: string[], hay: string) => ws.every((w) => hay.includes(w))

const entryHay = (e: Entry) => lower(`${e.seq} ${e.by} ${e.summary} ${e.status} ${e.reason ?? ""}`)
const recordHay = (r: QueuedRecord) => lower(`${r.id} ${r.feature} ${r.change} ${r.file} ${r.author}`)

/** The records of an entry the filter keeps (none: the entry is left out). */
function keptRecords(f: Filter, e: Entry): QueuedRecord[] {
  const ws = words(f.q)
  const g = entryHay(e)
  return e.records.filter((r) => (!f.op || r.change === f.op) && hasWords(ws.filter((w) => !g.includes(w)), recordHay(r)))
}

function FilterBar({ filter, set, clear }: { filter: Filter; set: (f: Partial<Filter>) => void; clear: () => void }) {
  const active = filter.q || filter.status || filter.op
  const sel = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
  return (
    <Card size="sm">
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="cf-q">Search</Label>
          <Input id="cf-q" value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Worlds, record ids, files, features, authors…" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-status">Status</Label>
          <select id="cf-status" className={sel} value={filter.status} onChange={(e) => set({ status: e.target.value as Filter["status"] })}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-op">Change</Label>
          <div className="flex gap-2">
            <select id="cf-op" className={`${sel} flex-1`} value={filter.op} onChange={(e) => set({ op: e.target.value as Filter["op"] })}>
              <option value="">Any</option>
              {OPS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <Button variant="outline" disabled={!active} onClick={clear} title="Show everything">
              <FilterXIcon data-icon="inline-start" />
              Clear
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------------ record diffs

/** A record's fields as JSON pointer-ish paths (`pos/0`, `wave/script`) → value. */
function flatten(v: unknown, prefix = "", out = new Map<string, unknown>()): Map<string, unknown> {
  if (v !== null && typeof v === "object") {
    const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v)
    if (!entries.length) out.set(prefix, v)
    for (const [k, x] of entries) flatten(x, prefix ? `${prefix}/${k}` : k, out)
  } else if (v !== undefined) {
    out.set(prefix, v)
  }
  return out
}

const show = (v: unknown) => (v === undefined ? "" : typeof v === "number" ? String(Math.round(v * 1000) / 1000) : JSON.stringify(v))

/** The fields that differ between `before` and `after` (all of them for an added or removed record). */
function differences(r: QueuedRecord): { path: string; before: unknown; after: unknown }[] {
  const a = flatten(r.before)
  const b = flatten(r.after)
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort()
  return paths.filter((p) => JSON.stringify(a.get(p)) !== JSON.stringify(b.get(p))).map((path) => ({ path, before: a.get(path), after: b.get(path) }))
}

/** A record's name, when it has one (spawns and NPCs do). */
function recordName(r: QueuedRecord): string | null {
  const v = (r.after ?? r.before) as Record<string, unknown> | null
  return v && typeof v === "object" && typeof v.name === "string" ? v.name : null
}

function Diff({ r }: { r: QueuedRecord }) {
  const rows = differences(r)
  if (!rows.length) return <p className="text-sm text-muted-foreground">No field differs.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Before</TableHead>
          <TableHead>After</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => (
          <TableRow key={d.path}>
            <TableCell className="font-mono text-xs">{d.path}</TableCell>
            <TableCell className="font-mono text-xs break-all whitespace-normal text-muted-foreground">{show(d.before)}</TableCell>
            <TableCell className="font-mono text-xs break-all whitespace-normal">{show(d.after)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ------------------------------------------------------------------ the queue

function EntryCard({ e, records, narrowed }: { e: Entry; records: QueuedRecord[]; narrowed: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const reject = useMutation({
    mutationFn: () => raw<Entry>("POST", "/v1/content/reject", { seq: e.seq, reason: reason.trim() || null }),
    onSuccess: () => {
      toast.success(`Rejected #${e.seq}`)
      setRejecting(false)
      setReason("")
      queryClient.invalidateQueries({ queryKey: ["content"] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const flip = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">#{e.seq}</span>
          {e.summary}
          <Badge variant={STATUS_VARIANT[e.status] ?? "outline"}>{e.status}</Badge>
        </CardTitle>
        <CardDescription>
          published by {e.by || "unknown"} {formatRelative(e.created)}
          {narrowed && records.length < e.records.length && ` · ${records.length} of ${e.records.length} records match the filter`}
          {e.status === "rejected" && e.reason && ` · rejected: ${e.reason}`}
        </CardDescription>
        {e.status === "queued" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled title={APPROVE_MISSING}>
              <CheckIcon data-icon="inline-start" />
              Approve
            </Button>
            {rejecting ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(ev) => {
                  ev.preventDefault()
                  reject.mutate()
                }}
              >
                <Input autoFocus className="h-8 w-72" value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Reason (the author sees it)" />
                <Button size="sm" variant="destructive" type="submit" disabled={reject.isPending}>
                  Reject #{e.seq}
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                <XIcon data-icon="inline-start" />
                Reject
              </Button>
            )}
            <span className="text-xs text-muted-foreground">{APPROVE_MISSING}.</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6" />
              <TableHead>Record</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Feature</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Author</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r) => {
              const isOpen = open.has(r.id)
              const name = recordName(r)
              return (
                <Fragment key={r.id}>
                  <TableRow className="cursor-pointer" onClick={() => flip(r.id)}>
                    <TableCell>{isOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}</TableCell>
                    <TableCell>
                      {name && <span className="mr-2 font-medium">{name}</span>}
                      <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={OP_VARIANT[r.change] ?? "outline"}>{r.change}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.feature}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.file}</TableCell>
                    <TableCell className="text-sm">{r.author}</TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={5}>
                        <Diff r={r} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Queue({ filter }: { filter: Filter }) {
  const q = useQuery({ queryKey: ["content", "queue"], queryFn: () => raw<Entry[]>("GET", "/v1/content/queue"), refetchInterval: 15_000 })
  const narrowed = !!(filter.q.trim() || filter.op)
  const shown = useMemo(
    () =>
      (q.data ?? [])
        .filter((e) => !filter.status || e.status === filter.status)
        .map((e) => ({ e, records: keptRecords(filter, e) }))
        .filter(({ e, records }) => records.length > 0 || (!narrowed && e.records.length === 0)),
    [q.data, filter, narrowed],
  )
  if (q.error) return <ErrorAlert error={q.error} />
  if (!q.data) return <Skeleton className="h-32 w-full" />
  if (!q.data.length) return <Empty>Nothing published: the world editors' work shows up here when they publish it.</Empty>
  if (!shown.length) return <Empty>Nothing matches the filter ({q.data.length} entr{q.data.length === 1 ? "y" : "ies"} hidden).</Empty>
  return (
    <div className="grid gap-4">
      {shown.length < q.data.length && (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {q.data.length} entries.
        </p>
      )}
      {shown.map(({ e, records }) => (
        <EntryCard key={e.seq} e={e} records={records} narrowed={narrowed} />
      ))}
    </div>
  )
}

export function ContentPage() {
  const state = useQuery({ queryKey: ["content", "state"], queryFn: () => raw<ContentState>("GET", "/v1/content/state"), refetchInterval: 15_000 })
  const [filter, setFilter, clearFilter] = useFilter()
  const s = state.data
  return (
    <div className="grid gap-6">
      <PageHeader
        title="World content"
        description={
          s
            ? `${s.queued ?? 0} entr${s.queued === 1 ? "y" : "ies"} waiting · this server runs ${s.content ?? "no content tree"}`
            : "What the world editors published, waiting for approval."
        }
      />
      {state.error && <ErrorAlert error={state.error} />}
      {s && !s.queue && <ErrorAlert title="No publish queue" error="This server runs without a publish queue (--content-queue), so world editors can't publish to it." />}
      <FilterBar filter={filter} set={setFilter} clear={clearFilter} />
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-semibold">Published</h2>
        <p className="text-sm text-muted-foreground">
          Oldest first. Click a record for the fields it changes. Rejected entries stay, with the reason, until their author publishes those records again. History will be the
          content repository's once approving is built.
        </p>
        <Queue filter={filter} />
      </section>
    </div>
  )
}
