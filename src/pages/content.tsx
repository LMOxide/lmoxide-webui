import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDownIcon, ChevronRightIcon, FilterXIcon, GitMergeIcon, XIcon } from "lucide-react"
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

// lmoxide docs/WORLD-CONTENT.md: world editors commit their changes, with a message, to their own
// branch (contrib/<name>) of the world editor's content; admins merge each commit into the
// content (its main) or reject it with a reason.

interface ContentState {
  /** the content tree this server runs */
  content: string | null
  /** contributor commits waiting (none: this server has no world editor content) */
  pending: number | null
  /** merged commits the content repository doesn't have yet */
  unpushed: number | null
}

type Op = "added" | "changed" | "removed"

interface CommitRecord {
  id: string
  feature: string
  change: Op
  /** relative to the content tree */
  file: string
  author: string
  before: unknown
  after: unknown
}

type Status = "pending" | "merged" | "rejected"

interface Contribution {
  hash: string
  branch: string
  /** whose changes */
  author: string
  /** who committed them */
  by: string
  created: number
  subject: string
  /** the whole commit message */
  message: string
  status: Status
  decision?: { status: string; by: string; at: number; reason?: string; merged_as?: string }
  records: CommitRecord[]
}

const OP_VARIANT = { added: "default", changed: "secondary", removed: "destructive" } as const
const STATUS_VARIANT = { pending: "outline", rejected: "destructive", merged: "default" } as const
const OPS: Op[] = ["added", "changed", "removed"]
const STATUSES: Status[] = ["pending", "merged", "rejected"]

// ------------------------------------------------------------------ filters

/** What the list shows (kept in the page's URL, so it can be shared). */
interface Filter {
  /** words anywhere: messages, record ids, files, features, authors */
  q: string
  status: "" | Status
  op: "" | Op
}

function useFilter(): [Filter, (f: Partial<Filter>) => void, () => void] {
  const [params, setParams] = useSearchParams()
  const filter: Filter = {
    q: params.get("q") ?? "",
    status: (STATUSES as string[]).includes(params.get("status") ?? "") ? (params.get("status") as Status) : "",
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

const commitHay = (c: Contribution) => lower(`${c.hash} ${c.branch} ${c.author} ${c.by} ${c.message} ${c.status} ${c.decision?.reason ?? ""} ${c.decision?.by ?? ""}`)
const recordHay = (r: CommitRecord) => lower(`${r.id} ${r.feature} ${r.change} ${r.file} ${r.author}`)

/** The records of a commit the filter keeps (none: the commit is left out). */
function keptRecords(f: Filter, c: Contribution): CommitRecord[] {
  const ws = words(f.q)
  const g = commitHay(c)
  return c.records.filter((r) => (!f.op || r.change === f.op) && hasWords(ws.filter((w) => !g.includes(w)), recordHay(r)))
}

function FilterBar({ filter, set, clear }: { filter: Filter; set: (f: Partial<Filter>) => void; clear: () => void }) {
  const active = filter.q || filter.status || filter.op
  const sel = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
  return (
    <Card size="sm">
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="cf-q">Search</Label>
          <Input id="cf-q" value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Messages, record ids, files, features, authors…" />
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
function differences(r: CommitRecord): { path: string; before: unknown; after: unknown }[] {
  const a = flatten(r.before)
  const b = flatten(r.after)
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort()
  return paths.filter((p) => JSON.stringify(a.get(p)) !== JSON.stringify(b.get(p))).map((path) => ({ path, before: a.get(path), after: b.get(path) }))
}

/** A record's name, when it has one (spawns and NPCs do). */
function recordName(r: CommitRecord): string | null {
  const v = (r.after ?? r.before) as Record<string, unknown> | null
  return v && typeof v === "object" && typeof v.name === "string" ? v.name : null
}

function Diff({ r }: { r: CommitRecord }) {
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

// ------------------------------------------------------------------ the commits

/** The body of a commit message (after its first line), if any. */
const body = (c: Contribution) => c.message.split("\n").slice(1).join("\n").trim()

function CommitCard({ c, records, narrowed }: { c: Contribution; records: CommitRecord[]; narrowed: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const short = c.hash.slice(0, 8)
  const done = () => queryClient.invalidateQueries({ queryKey: ["content"] })
  const merge = useMutation({
    mutationFn: () => raw<{ merged: string }>("POST", `/v1/content/commits/${c.hash}/merge`),
    onSuccess: (r) => {
      toast.success(`Merged ${short} as ${r.merged.slice(0, 8)}`)
      done()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const reject = useMutation({
    mutationFn: () => raw<Contribution>("POST", `/v1/content/commits/${c.hash}/reject`, { reason: reason.trim() || null }),
    onSuccess: () => {
      toast.success(`Rejected ${short}`)
      setRejecting(false)
      setReason("")
      done()
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
  const text = body(c)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{short}</span>
          {c.subject}
          <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>{c.status}</Badge>
        </CardTitle>
        <CardDescription>
          {c.author || "unknown"}'s changes
          {c.by !== c.author && `, committed by ${c.by}`} {formatRelative(c.created)} · {c.records.length} record{c.records.length === 1 ? "" : "s"} · {c.branch}
          {narrowed && records.length < c.records.length && ` · ${records.length} of ${c.records.length} records match the filter`}
          {c.decision && ` · ${c.decision.status} by ${c.decision.by} ${formatRelative(c.decision.at)}`}
          {c.decision?.reason && `: ${c.decision.reason}`}
          {c.decision?.merged_as && ` (as ${c.decision.merged_as.slice(0, 8)})`}
        </CardDescription>
        {text && <pre className="text-sm whitespace-pre-wrap">{text}</pre>}
        {c.status === "pending" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={merge.isPending} onClick={() => merge.mutate()} title="Apply this commit's change to the content (as its author, with you as the approver)">
              <GitMergeIcon data-icon="inline-start" />
              Merge
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
                  Reject {short}
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
              const k = `${r.id} ${r.feature}`
              const isOpen = open.has(k)
              const name = recordName(r)
              return (
                <Fragment key={k}>
                  <TableRow className="cursor-pointer" onClick={() => flip(k)}>
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

function Commits({ filter }: { filter: Filter }) {
  const q = useQuery({ queryKey: ["content", "commits"], queryFn: () => raw<Contribution[]>("GET", "/v1/content/commits"), refetchInterval: 15_000 })
  const narrowed = !!(filter.q.trim() || filter.op)
  const shown = useMemo(
    () =>
      (q.data ?? [])
        .filter((c) => !filter.status || c.status === filter.status)
        .map((c) => ({ c, records: keptRecords(filter, c) }))
        .filter(({ c, records }) => records.length > 0 || (!narrowed && c.records.length === 0)),
    [q.data, filter, narrowed],
  )
  if (q.error) return <ErrorAlert error={q.error} />
  if (!q.data) return <Skeleton className="h-32 w-full" />
  if (!q.data.length) return <Empty>No commits yet: the world editors' work shows up here when they commit it.</Empty>
  if (!shown.length) return <Empty>Nothing matches the filter ({q.data.length} commit{q.data.length === 1 ? "" : "s"} hidden).</Empty>
  return (
    <div className="grid gap-4">
      {shown.length < q.data.length && (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {q.data.length} commits.
        </p>
      )}
      {shown.map(({ c, records }) => (
        <CommitCard key={c.hash} c={c} records={records} narrowed={narrowed} />
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
            ? `${s.pending ?? 0} commit${s.pending === 1 ? "" : "s"} waiting${s.unpushed ? ` · ${s.unpushed} merged, not in the content repository yet` : ""} · this server runs ${s.content ?? "no content tree"}`
            : "What the world editors committed, to merge or reject."
        }
      />
      {state.error && <ErrorAlert error={state.error} />}
      {s && s.pending === null && <ErrorAlert title="No world editor content" error="This server doesn't run the world editor's content (--editor-content-dir), so there are no commits to review here." />}
      <FilterBar filter={filter} set={setFilter} clear={clearFilter} />
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-semibold">Commits</h2>
        <p className="text-sm text-muted-foreground">
          Oldest first. Click a record for the fields it changes. Merging applies that commit's change to the world editor's content as its author (you as the approver); play servers get it
          once it is pushed to the content repository. A rejected commit stays on its author's branch with your reason.
        </p>
        <Commits filter={filter} />
      </section>
    </div>
  )
}
