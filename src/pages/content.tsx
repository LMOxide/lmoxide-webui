import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, EyeIcon, FilterXIcon, RedoIcon, RefreshCwIcon, UndoIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { api, errorMessage, raw, unwrap } from "@/api/client"
import { Empty, ErrorAlert, PageHeader } from "@/components/common"
import { SuggestInput, TokenInput, type Suggestion } from "@/components/suggest-input"
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
import { usePlayfields } from "@/lib/queries"

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
  /** everyone who made a record, and every tag, in either set (newer servers) */
  authors?: string[]
  tags?: string[]
}

interface Item {
  kind: "placement" | "trigger" | "note" | "script" | "smash_rule"
  id: string
  name: string
  op: "added" | "changed" | "removed"
  details?: string[]
  updated: number
  /** the record's labels: approximate, todo, review, ... */
  tags?: string[]
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
  /** tag → records carrying it */
  tags?: Record<string, number>
  updated: number
}

/** An approval in this server's history (`/v1/content/history`): it can be undone and redone. */
interface HistoryEntry {
  seq: number
  at: number
  by: string
  playfield: number
  playfield_name: string | null
  feature: string
  feature_path: string
  author: string
  summary: string
  status: "applied" | "undone" | "preview" | "preview_ended"
  preview_until?: number
  last_action?: [string, number]
  actions: ("undo" | "redo" | "keep" | "revert")[]
  edits: { kind: Item["kind"]; id: string; name: string; op: Item["op"]; details?: string[]; tags?: string[] }[]
}

/** How long a preview lasts, minutes. */
const PREVIEW_MINUTES = 15

const OP_VARIANT = { added: "default", changed: "secondary", removed: "destructive" } as const

// ------------------------------------------------------------------ filters

/** What the queue, history and summary show (kept in the page's URL, so it can be shared). */
interface Filter {
  /** words anywhere: names, details, ids, tags, authors, worlds, features */
  q: string
  /** a playfield id, or part of a world's name */
  world: string
  /** a feature id (nested ones included), or part of its path */
  feature: string
  /** part of an author's name */
  author: string
  /** records with any of these tags ("-": untagged) */
  tags: string[]
  op: "" | Item["op"]
  kind: "" | Item["kind"]
}

const KINDS: Item["kind"][] = ["placement", "trigger", "note", "script", "smash_rule"]
const OPS: Item["op"][] = ["added", "changed", "removed"]

function useFilter(): [Filter, (f: Partial<Filter>) => void, () => void] {
  const [params, setParams] = useSearchParams()
  const filter: Filter = {
    q: params.get("q") ?? "",
    world: params.get("world") ?? "",
    feature: params.get("feature") ?? "",
    author: params.get("author") ?? "",
    tags: params.getAll("tag"),
    op: (OPS as string[]).includes(params.get("op") ?? "") ? (params.get("op") as Item["op"]) : "",
    kind: (KINDS as string[]).includes(params.get("kind") ?? "") ? (params.get("kind") as Item["kind"]) : "",
  }
  const set = (f: Partial<Filter>) => {
    const next = { ...filter, ...f }
    const p = new URLSearchParams()
    for (const k of ["q", "world", "feature", "author", "op", "kind"] as const) if (next[k]) p.set(k, next[k])
    for (const t of next.tags) p.append("tag", t)
    setParams(p, { replace: true })
  }
  return [filter, set, () => setParams(new URLSearchParams(), { replace: true })]
}

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase()
const words = (q: string) => lower(q).split(/\s+/).filter(Boolean)
/** Whether every word is somewhere in `hay`. */
const hasWords = (ws: string[], hay: string) => ws.every((w) => hay.includes(w))

/** The group-level filters: world, feature, author. */
function keyMatches(f: Filter, k: { playfield: number; playfield_name: string | null; feature: string; feature_path: string; author?: string; authors?: string[] }) {
  if (f.world && String(k.playfield) !== f.world.trim() && !lower(k.playfield_name).includes(lower(f.world.trim()))) return false
  if (f.feature) {
    const want = f.feature.trim()
    if (k.feature !== want && !k.feature.startsWith(`${want}/`) && !lower(k.feature_path).includes(lower(want))) return false
  }
  if (f.author) {
    const names = k.author !== undefined ? [k.author] : (k.authors ?? [])
    if (!names.some((a) => lower(a).includes(lower(f.author.trim())))) return false
  }
  return true
}

/** The record-level filters: tags, op, kind (the search is checked with the group's words too). */
function itemMatches(f: Filter, i: { kind: Item["kind"]; op: Item["op"]; tags?: string[] }) {
  if (f.op && i.op !== f.op) return false
  if (f.kind && i.kind !== f.kind) return false
  if (f.tags.length && !(i.tags?.length ? i.tags.some((t) => f.tags.includes(t)) : f.tags.includes("-"))) return false
  return true
}

const itemHay = (i: { id: string; name: string; details?: string[]; tags?: string[]; kind: string; op: string }) =>
  lower(`${i.name} ${i.id} ${i.kind} ${i.op} ${(i.details ?? []).join(" ")} ${(i.tags ?? []).map((t) => `#${t} ${t}`).join(" ")}`)

const groupHay = (k: { playfield: number; playfield_name: string | null; feature: string; feature_path: string; author?: string; summary?: string }) =>
  lower(`${k.playfield} ${k.playfield_name} ${k.feature} ${k.feature_path} ${k.author ?? ""} ${k.summary ?? ""}`)

/** Whether any record-level filter (or a search) narrows a group to some of its records. */
const narrowsItems = (f: Filter) => !!(f.q.trim() || f.tags.length || f.op || f.kind)

/** The records of a group the filter keeps (none: the group is left out). */
function keptItems<T extends { id: string; name: string; details?: string[]; tags?: string[]; kind: Item["kind"]; op: Item["op"] }>(f: Filter, group: Parameters<typeof groupHay>[0], items: T[]): T[] {
  const ws = words(f.q)
  const g = groupHay(group)
  return items.filter((i) => itemMatches(f, i) && hasWords(ws.filter((w) => !g.includes(w)), itemHay(i)))
}

/** Usernames of accounts matching what is typed (GET /v1/accounts?search=), for suggestions. */
function useAccountNames(search: string) {
  const q = useQuery({
    queryKey: ["content", "account-names", search],
    queryFn: async () => (await unwrap(api.GET("/v1/accounts", { params: { query: { search: search || null, offset: 0, limit: 20 } } }))).map((a) => a.username),
    staleTime: 60_000,
    retry: false,
  })
  return q.data ?? []
}

/** World editor authors and matching accounts, authors first. */
function useAuthorSuggestions(state: ContentState | undefined, typed: string): Suggestion[] {
  const accounts = useAccountNames(typed.trim())
  return useMemo(() => {
    const authors = state?.authors ?? []
    const seen = new Set(authors.map(lower))
    return [
      ...authors.map((a) => ({ value: a, detail: "world editor author" })),
      ...accounts.filter((a) => !seen.has(lower(a))).map((a) => ({ value: a, detail: "account" })),
    ]
  }, [state?.authors, accounts])
}

const tidyTag = (t: string) =>
  t
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s/g, "-")
    .replace(/[^\p{L}\p{N}\-_/]/gu, "")

function FilterBar({ filter, set, clear, state }: { filter: Filter; set: (f: Partial<Filter>) => void; clear: () => void; state: ContentState | undefined }) {
  const playfields = usePlayfields()
  const features = useQuery({ queryKey: ["content", "features"], queryFn: () => raw<FeatureRow[]>("GET", "/v1/content/features") })
  const [typedAuthor, setTypedAuthor] = useState("")
  const authors = useAuthorSuggestions(state, typedAuthor)
  const worlds: Suggestion[] = useMemo(() => [...(playfields.data ?? new Map<number, string>())].map(([id, name]) => ({ value: String(id), label: name, detail: String(id) })), [playfields.data])
  const featureOptions: Suggestion[] = useMemo(() => [{ value: "live", label: "Mimic live" }, { value: "feature", label: "New content" }, { value: "other", label: "Other" }, ...(features.data ?? []).map((f) => ({ value: f.id, label: f.path, detail: f.id }))], [features.data])
  const tags: Suggestion[] = [...(state?.tags ?? []).map((t) => ({ value: t, label: `#${t}` })), { value: "-", label: "untagged" }]
  const active = filter.q || filter.world || filter.feature || filter.author || filter.tags.length || filter.op || filter.kind
  const sel = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
  return (
    <Card size="sm" className="overflow-visible">
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="cf-q">Search</Label>
          <Input id="cf-q" value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Names, details, ids, #tags…" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-world">World</Label>
          <SuggestInput id="cf-world" value={filter.world} onChange={(world) => set({ world })} options={worlds} placeholder="Any world" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-feature">Feature</Label>
          <SuggestInput id="cf-feature" value={filter.feature} onChange={(feature) => set({ feature })} options={featureOptions} placeholder="Any feature" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-author">Author</Label>
          <SuggestInput id="cf-author" value={filter.author} onChange={(author) => set({ author })} onType={setTypedAuthor} options={authors} placeholder="Anyone" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-tags">Tags (any of)</Label>
          <TokenInput id="cf-tags" values={filter.tags} onChange={(t) => set({ tags: t })} options={tags} format={(t) => (t === "-" ? "untagged" : `#${t}`)} tidy={(t) => (t.trim() === "-" ? "-" : tidyTag(t))} placeholder="#approximate, #todo…" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-op">Change</Label>
          <select id="cf-op" className={sel} value={filter.op} onChange={(e) => set({ op: e.target.value as Filter["op"] })}>
            <option value="">Any</option>
            {OPS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-kind">Record</Label>
          <div className="flex gap-2">
            <select id="cf-kind" className={`${sel} flex-1`} value={filter.kind} onChange={(e) => set({ kind: e.target.value as Filter["kind"] })}>
              <option value="">Any</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === "trigger" ? "trigger wall" : k === "smash_rule" ? "smash achievement" : k}
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

function Tags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return (
    <>
      {tags.map((t) => (
        <Badge key={t} variant="outline" className="ml-1 text-xs">
          #{t}
        </Badge>
      ))}
    </>
  )
}

function useContentState() {
  return useQuery({ queryKey: ["content", "state"], queryFn: () => raw<ContentState>("GET", "/v1/content/state"), refetchInterval: 15_000 })
}

function Queue({ filter }: { filter: Filter }) {
  const queryClient = useQueryClient()
  const q = useQuery({ queryKey: ["content", "queue"], queryFn: () => raw<Change[]>("GET", "/v1/content/queue"), refetchInterval: 15_000 })
  const shown = useMemo(
    () => (q.data ?? []).filter((c) => keyMatches(filter, c)).map((c) => ({ c, items: keptItems(filter, c, c.items) })).filter(({ items }) => items.length > 0),
    [q.data, filter],
  )
  const narrowed = narrowsItems(filter)
  const decide = useMutation({
    mutationFn: ({ verb, change, ids }: { verb: "approve" | "reject"; change: Change; ids?: string[] }) =>
      raw<{ records: number }>("POST", `/v1/content/${verb}`, { playfield: change.playfield, feature: change.feature, author: change.author, ids }),
    onSuccess: (r, v) => {
      toast.success(`${v.verb === "approve" ? "Approved" : "Rejected"} ${r.records} record${r.records === 1 ? "" : "s"}`)
      queryClient.invalidateQueries({ queryKey: ["content"] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const preview = useMutation({
    mutationFn: (change: Change) =>
      raw<{ records: number; seq: number }>("POST", "/v1/content/preview", {
        playfield: change.playfield,
        feature: change.feature,
        author: change.author,
        minutes: PREVIEW_MINUTES,
      }),
    onSuccess: (r) => {
      toast.success(`Previewing ${r.records} record${r.records === 1 ? "" : "s"} for ${PREVIEW_MINUTES} minutes: keep or revert it under History`)
      queryClient.invalidateQueries({ queryKey: ["content"] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (q.error) return <ErrorAlert error={q.error} />
  if (!q.data) return <Skeleton className="h-32 w-full" />
  if (!q.data.length) return <Empty>Nothing waiting: the world editors' work is all approved (or rejected).</Empty>
  if (!shown.length) return <Empty>Nothing waiting matches the filter ({q.data.length} change{q.data.length === 1 ? "" : "s"} hidden).</Empty>
  return (
    <div className="grid gap-4">
      {shown.length < q.data.length && (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {q.data.length} changes.
        </p>
      )}
      {shown.map(({ c, items }) => {
        // with a filter, the buttons act on the records shown only
        const some = narrowed && items.length < c.items.length
        const ids = some ? items.map((i) => i.id) : undefined
        return (
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
              {some && ` · ${items.length} of ${c.items.length} records match the filter`}
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ verb: "approve", change: c, ids })}>
                <CheckIcon data-icon="inline-start" />
                {some ? (items.length === 1 ? "Approve this one" : `Approve these ${items.length}`) : "Approve all"}
              </Button>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ verb: "reject", change: c, ids })}>
                <XIcon data-icon="inline-start" />
                {some ? (items.length === 1 ? "Reject this one" : `Reject these ${items.length}`) : "Reject all"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={preview.isPending || some}
                onClick={() => preview.mutate(c)}
                title={some ? "Previews take the whole change: clear the filter to preview it" : `Put it in the game for everyone for ${PREVIEW_MINUTES} minutes; then it comes back here unless you keep it`}
              >
                <EyeIcon data-icon="inline-start" />
                Preview
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
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="font-medium">{i.name}</span> <span className="text-xs text-muted-foreground">{i.kind}</span>
                      <Tags tags={i.tags} />
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
        )
      })}
    </div>
  )
}

const STATUS: Record<HistoryEntry["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  applied: { label: "approved", variant: "default" },
  undone: { label: "undone", variant: "secondary" },
  preview: { label: "preview", variant: "outline" },
  preview_ended: { label: "preview ended", variant: "secondary" },
}

const ACTION = {
  undo: { label: "Undo", icon: UndoIcon, done: "Undone" },
  redo: { label: "Redo", icon: RedoIcon, done: "Applied again" },
  keep: { label: "Keep", icon: CheckIcon, done: "Kept (approved)" },
  revert: { label: "Revert", icon: XIcon, done: "Reverted: back in the queue" },
} as const

function History({ filter }: { filter: Filter }) {
  const queryClient = useQueryClient()
  const q = useQuery({ queryKey: ["content", "history"], queryFn: () => raw<HistoryEntry[]>("GET", "/v1/content/history"), refetchInterval: 15_000 })
  const shown = useMemo(
    () => (q.data ?? []).filter((e) => keyMatches(filter, e) && (!narrowsItems(filter) || keptItems(filter, e, e.edits).length > 0 || (!!filter.q && !filter.tags.length && !filter.op && !filter.kind && hasWords(words(filter.q), groupHay(e) + ` ${e.seq} ${lower(e.by)}`)))),
    [q.data, filter],
  )
  const act = useMutation({
    mutationFn: ({ seq, action }: { seq: number; action: HistoryEntry["actions"][number] }) => raw<HistoryEntry>("POST", `/v1/content/history/${seq}/${action}`),
    onSuccess: (_, v) => {
      toast.success(ACTION[v.action].done)
      queryClient.invalidateQueries({ queryKey: ["content"] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (q.error) return <ErrorAlert error={q.error} />
  if (!q.data) return <Skeleton className="h-24 w-full" />
  if (!q.data.length) return <Empty>No approvals yet. Approved and previewed changes show up here, to undo or redo.</Empty>
  if (!shown.length) return <Empty>No approval matches the filter.</Empty>
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>World / feature</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((e) => (
              <TableRow key={e.seq}>
                <TableCell className="text-muted-foreground">{e.seq}</TableCell>
                <TableCell>
                  <span className="font-medium">{e.playfield_name ?? `Playfield ${e.playfield}`}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{e.feature_path}</span>
                </TableCell>
                <TableCell className="text-sm" title={e.edits.map((x) => `${x.op} ${x.name}${x.details?.length ? ` (${x.details.join(", ")})` : ""}${x.tags?.length ? ` ${x.tags.map((t) => `#${t}`).join(" ")}` : ""}`).join("\n")}>
                  by {e.author || "unknown"} · {e.summary}
                  <Tags tags={[...new Set(e.edits.flatMap((x) => x.tags ?? []))]} />
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS[e.status].variant}>{STATUS[e.status].label}</Badge>
                  {e.status === "preview" && e.preview_until && <span className="ml-2 text-xs text-muted-foreground">ends {formatRelative(e.preview_until)}</span>}
                  {e.last_action && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {e.last_action[0]} {formatRelative(e.last_action[1])}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {e.by} {formatRelative(e.at)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {e.actions.map((a) => {
                    const A = ACTION[a]
                    return (
                      <Button key={a} size="sm" variant={a === "keep" ? "default" : "outline"} className="ml-2" disabled={act.isPending} onClick={() => act.mutate({ seq: e.seq, action: a })}>
                        <A.icon data-icon="inline-start" />
                        {A.label}
                      </Button>
                    )
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function toggle(list: string[], id: string, on: boolean) {
  return on ? [...new Set([...list, id])] : list.filter((x) => x !== id)
}

function RulesCard({ rules, state }: { rules: Rules; state: ContentState | undefined }) {
  const queryClient = useQueryClient()
  const features = useQuery({ queryKey: ["content", "features"], queryFn: () => raw<FeatureRow[]>("GET", "/v1/content/features") })
  const [draft, setDraft] = useState(rules)
  const [authors, setAuthors] = useState(rules.auto_authors)
  const [typedAuthor, setTypedAuthor] = useState("")
  const authorOptions = useAuthorSuggestions(state, typedAuthor)
  const save = useMutation({
    mutationFn: () => raw<Rules>("PUT", "/v1/content/rules", { ...draft, auto_authors: authors }),
    onSuccess: () => {
      toast.success("Rules saved")
      queryClient.invalidateQueries({ queryKey: ["content"] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const rows = features.data ?? []
  return (
    <Card className="overflow-visible">
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
          <Label htmlFor="auto-authors">Auto-approve authors (world editor usernames)</Label>
          <TokenInput id="auto-authors" values={authors} onChange={setAuthors} onType={setTypedAuthor} options={authorOptions} placeholder="Type a name: authors and accounts are suggested" />
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

function Summary({ filter }: { filter: Filter }) {
  const [of, setOf] = useState<"approved" | "working">("approved")
  const q = useQuery({ queryKey: ["content", "summary", of], queryFn: () => raw<{ rows: SummaryRow[] }>("GET", `/v1/content/summary?of=${of}`) })
  const ws = words(filter.q)
  const rows = (q.data?.rows ?? []).filter(
    (r) =>
      keyMatches(filter, r) &&
      (!filter.tags.length || filter.tags.some((t) => (t === "-" ? Object.keys(r.tags ?? {}).length === 0 : !!r.tags?.[t]))) &&
      hasWords(ws, `${groupHay(r)} ${lower(r.authors.join(" "))} ${Object.keys(r.tags ?? {}).map((t) => `#${t} ${t}`).join(" ")}`),
  )
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
        ) : !rows.length ? (
          <Empty>Nothing matches the filter.</Empty>
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
                <TableHead>Tags</TableHead>
                <TableHead>Last change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
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
                  <TableCell className="text-sm">
                    {Object.entries(r.tags ?? {}).map(([t, n]) => (
                      <Badge key={t} variant="outline" className="mr-1 text-xs" title={`${n} record${n === 1 ? "" : "s"}`}>
                        #{t} {n}
                      </Badge>
                    ))}
                  </TableCell>
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
  const [filter, setFilter, clearFilter] = useFilter()
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
      <FilterBar filter={filter} set={setFilter} clear={clearFilter} state={state.data} />
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-semibold">Waiting for approval</h2>
        <Queue filter={filter} />
      </section>
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-semibold">History</h2>
        <p className="text-sm text-muted-foreground">
          Every approval, newest first. Undo takes a change out of the game (later changes to the same things stay); redo puts it back. Previews are in the game for everyone
          until you keep or revert them, or their time ends (then they wait above again).
        </p>
        <History filter={filter} />
      </section>
      {/* (keyed: saved rules start a fresh draft) */}
      {state.data && <RulesCard key={JSON.stringify(state.data.rules)} rules={state.data.rules} state={state.data} />}
      <Summary filter={filter} />
    </div>
  )
}
