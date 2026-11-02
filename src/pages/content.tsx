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

// lmoxide docs/WORLD-CONTENT.md: world editors commit their changes, with messages, to branches
// of theirs (contrib/<editor>/<name>) of the world editor's content; admins review a branch as a
// whole and merge it into the content (its main, one commit) or reject it with a reason (its
// editor's next commit to it reopens it).

interface ContentState {
  /** the content tree this server runs */
  content: string | null
  /** contributor branches waiting (none: this server has no world editor content) */
  pending: number | null
  /** merged commits the content repository doesn't have yet */
  unpushed: number | null
}

type Op = "added" | "changed" | "removed"

interface BranchRecord {
  id: string
  feature: string
  change: Op
  /** relative to the content tree */
  file: string
  author: string
  /** as the content has it now (closed branches: as the branch started) */
  before: unknown
  after: unknown
  /** the content changed it since the branch started: merging puts the branch's version over it */
  conflict: boolean
  /** as the branch started (with a conflict) */
  base?: unknown
}

type Status = "open" | "pending" | "rejected" | "merged" | "reset" | "deleted"

interface BranchCommit {
  hash: string
  author: string
  by: string
  created: number
  subject: string
  message: string
}

interface Branch {
  /** contrib/<editor>/<name> */
  branch: string
  /** the name as its editor typed it */
  title: string
  author: string
  status: Status
  tip: string
  base: string
  updated: number
  decision?: { status: string; by: string; at: number; reason?: string; tip: string }
  closed?: { branch: string; title: string; status: string; by: string; at: number; merged_as?: string; decision?: { by: string; at: number; reason?: string } }
  commits: BranchCommit[]
  records: BranchRecord[]
  conflicts: number
}

const OP_VARIANT = { added: "default", changed: "secondary", removed: "destructive" } as const
const STATUS_VARIANT = { open: "secondary", pending: "outline", rejected: "destructive", merged: "default", reset: "secondary", deleted: "secondary" } as const
const OPS: Op[] = ["added", "changed", "removed"]
const STATUSES: Status[] = ["pending", "rejected", "open", "merged", "reset", "deleted"]

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

const branchHay = (b: Branch) =>
  lower(`${b.branch} ${b.title} ${b.author} ${b.status} ${b.decision?.reason ?? ""} ${b.decision?.by ?? ""} ${b.closed?.by ?? ""} ${b.commits.map((c) => `${c.hash} ${c.by} ${c.message}`).join(" ")}`)
const recordHay = (r: BranchRecord) => lower(`${r.id} ${r.feature} ${r.change} ${r.file} ${r.author}`)

/** The records of a branch the filter keeps (none: the branch is left out). */
function keptRecords(f: Filter, b: Branch): BranchRecord[] {
  const ws = words(f.q)
  const g = branchHay(b)
  return b.records.filter((r) => (!f.op || r.change === f.op) && hasWords(ws.filter((w) => !g.includes(w)), recordHay(r)))
}

function FilterBar({ filter, set, clear }: { filter: Filter; set: (f: Partial<Filter>) => void; clear: () => void }) {
  const active = filter.q || filter.status || filter.op
  const sel = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
  return (
    <Card size="sm">
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="cf-q">Search</Label>
          <Input id="cf-q" value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Branches, messages, record ids, files, authors…" />
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
function differences(r: BranchRecord): { path: string; before: unknown; after: unknown }[] {
  const a = flatten(r.before)
  const b = flatten(r.after)
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort()
  return paths.filter((p) => JSON.stringify(a.get(p)) !== JSON.stringify(b.get(p))).map((path) => ({ path, before: a.get(path), after: b.get(path) }))
}

/** A record's name, when it has one (spawns and NPCs do). */
function recordName(r: BranchRecord): string | null {
  const v = (r.after ?? r.before) as Record<string, unknown> | null
  return v && typeof v === "object" && typeof v.name === "string" ? v.name : null
}

function Diff({ r }: { r: BranchRecord }) {
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

// ------------------------------------------------------------------ the branches

/** A branch's path under /v1/content/branches. */
const pathOf = (b: Branch) => `/v1/content/branches/${b.branch.replace(/^contrib\//, "")}`

function BranchCard({ b, records, narrowed }: { b: Branch; records: BranchRecord[]; narrowed: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [merging, setMerging] = useState(false)
  const [message, setMessage] = useState("")
  const done = () => queryClient.invalidateQueries({ queryKey: ["content"] })
  const merge = useMutation({
    mutationFn: () => raw<{ merged: string }>("POST", `${pathOf(b)}/merge`, { message: message.trim() || null, force: b.conflicts > 0 }),
    onSuccess: (r) => {
      toast.success(`Merged ${b.title} as ${r.merged.slice(0, 8)}`)
      setMerging(false)
      setMessage("")
      done()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const reject = useMutation({
    mutationFn: () => raw<Branch>("POST", `${pathOf(b)}/reject`, { reason: reason.trim() || null }),
    onSuccess: () => {
      toast.success(`Rejected ${b.title}`)
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
  const reason0 = b.decision?.reason ?? b.closed?.decision?.reason
  const reviewable = b.status === "pending" || b.status === "rejected"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {b.title}
          <Badge variant={STATUS_VARIANT[b.status] ?? "outline"}>{b.status}</Badge>
          {b.conflicts > 0 && !b.closed && <Badge variant="destructive">{b.conflicts} changed in the content since</Badge>}
        </CardTitle>
        <CardDescription>
          {b.author || "unknown"}'s branch <span className="font-mono">{b.branch}</span>
          {b.updated > 0 && ` · last commit ${formatRelative(b.updated)}`} · {b.commits.length} commit{b.commits.length === 1 ? "" : "s"} · {b.records.length} record
          {b.records.length === 1 ? "" : "s"}
          {narrowed && records.length < b.records.length && ` · ${records.length} match the filter`}
          {b.decision && ` · rejected by ${b.decision.by} ${formatRelative(b.decision.at)}`}
          {b.closed && ` · ${b.closed.status} by ${b.closed.by} ${formatRelative(b.closed.at)}`}
          {b.closed?.merged_as && ` (as ${b.closed.merged_as.slice(0, 8)})`}
          {reason0 && ` · reason: ${reason0}`}
        </CardDescription>
        {b.commits.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {b.commits.map((c) => {
              const body = c.message.split("\n").slice(1).join("\n").trim()
              return (
                <li key={c.hash}>
                  <span className="font-mono text-xs text-muted-foreground">{c.hash.slice(0, 8)}</span> <span className="font-medium">{c.subject}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatRelative(c.created)}
                    {c.by !== c.author && ` · committed by ${c.by}`}
                  </span>
                  {body && <pre className="ml-6 text-xs whitespace-pre-wrap text-muted-foreground">{body}</pre>}
                </li>
              )
            })}
          </ul>
        )}
        {reviewable && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {merging ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault()
                    merge.mutate()
                  }}
                >
                  <Input autoFocus className="h-8 w-96" value={message} onChange={(ev) => setMessage(ev.target.value)} placeholder="Merge message (default: the branch's commit messages)" />
                  <Button size="sm" type="submit" disabled={merge.isPending}>
                    <GitMergeIcon data-icon="inline-start" />
                    {b.conflicts > 0 ? `Merge, over ${b.conflicts} record${b.conflicts === 1 ? "" : "s"}` : "Merge"}
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setMerging(false)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <Button size="sm" onClick={() => setMerging(true)} title="Put this branch's records into the content as one commit (by its editor, you as the approver)">
                  <GitMergeIcon data-icon="inline-start" />
                  Merge…
                </Button>
              )}
              {rejecting ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault()
                    reject.mutate()
                  }}
                >
                  <Input autoFocus className="h-8 w-72" value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Reason (the editor sees it)" />
                  <Button size="sm" variant="destructive" type="submit" disabled={reject.isPending}>
                    Reject
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setRejecting(false)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                b.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                    <XIcon data-icon="inline-start" />
                    Reject
                  </Button>
                )
              )}
            </div>
            {merging && b.conflicts > 0 && (
              <p className="text-sm text-destructive">
                The content changed {b.conflicts} of these records since the branch started (marked below): merging puts the branch's versions over those changes.
              </p>
            )}
          </div>
        )}
      </CardHeader>
      {records.length > 0 && (
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
                        {r.conflict && (
                          <Badge variant="destructive" className="ml-1" title="The content changed this record since the branch started">
                            changed since
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.feature}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.file}</TableCell>
                      <TableCell className="text-sm">{r.author}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={5}>
                          {r.conflict && <p className="mb-2 text-xs text-muted-foreground">Before: as the content has it now (the branch started from an older version).</p>}
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
      )}
    </Card>
  )
}

function Branches({ filter }: { filter: Filter }) {
  const q = useQuery({ queryKey: ["content", "branches"], queryFn: () => raw<Branch[]>("GET", "/v1/content/branches"), refetchInterval: 15_000 })
  const narrowed = !!(filter.q.trim() || filter.op)
  const shown = useMemo(
    () =>
      (q.data ?? [])
        .filter((b) => (filter.status ? b.status === filter.status : b.status !== "open"))
        .map((b) => ({ b, records: keptRecords(filter, b) }))
        .filter(({ b, records }) => records.length > 0 || (!narrowed && b.records.length === 0)),
    [q.data, filter, narrowed],
  )
  if (q.error) return <ErrorAlert error={q.error} />
  if (!q.data) return <Skeleton className="h-32 w-full" />
  if (!q.data.length) return <Empty>No branches yet: the world editors' work shows up here when they commit it.</Empty>
  if (!shown.length) return <Empty>Nothing matches the filter ({q.data.length} branch{q.data.length === 1 ? "" : "es"} hidden).</Empty>
  return (
    <div className="grid gap-4">
      {shown.length < q.data.length && (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {q.data.length} branches{!filter.status && " (open ones with nothing to merge left out)"}.
        </p>
      )}
      {shown.map(({ b, records }) => (
        <BranchCard key={`${b.branch} ${b.closed ? b.tip : ""}`} b={b} records={records} narrowed={narrowed} />
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
            ? `${s.pending ?? 0} branch${s.pending === 1 ? "" : "es"} waiting${s.unpushed ? ` · ${s.unpushed} merged, not in the content repository yet` : ""} · this server runs ${s.content ?? "no content tree"}`
            : "What the world editors committed, to merge or reject."
        }
      />
      {state.error && <ErrorAlert error={state.error} />}
      {s && s.pending === null && <ErrorAlert title="No world editor content" error="This server doesn't run the world editor's content (--editor-content-dir), so there are no branches to review here." />}
      <FilterBar filter={filter} set={setFilter} clear={clearFilter} />
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-semibold">Branches</h2>
        <p className="text-sm text-muted-foreground">
          Waiting ones first, oldest first; then merged, reset and deleted ones. Click a record for the fields the branch changes against the content now. Merging puts the whole branch
          into the world editor's content as one commit by its editor (you as the approver); play servers get it once it is pushed to the content repository. A rejected branch waits
          for its editor's fixes, with your reason.
        </p>
        <Branches filter={filter} />
      </section>
    </div>
  )
}
