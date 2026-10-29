import { useQuery } from "@tanstack/react-query"
import { RefreshCwIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { api, unwrap } from "@/api/client"
import { Empty, ErrorAlert, ModeBadge, PageHeader, Stat } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MODES, modeName, modeOrder, numberFormat } from "@/lib/format"
import { usePlayfields } from "@/lib/queries"

const KIND_ORDER: Record<string, number> = { main: 0, extra: 1, preview: 2 }

const KIND_HINT: Record<string, string> = {
  main: "The game mode's main copy of this world",
  extra: "An extra copy: a team's pocket world, or an open world past its player cap",
  preview: "A world editor preview of waiting content",
}

const ms = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)} ms`

/** The running copies of worlds (each game mode's main copies, extra copies, previews). */
export function InstancesPage() {
  const playfields = usePlayfields()
  const [mode, setMode] = useState<string>("all")
  const [withPlayers, setWithPlayers] = useState(true)
  const q = useQuery({
    queryKey: ["instances"],
    queryFn: () => unwrap(api.GET("/v1/instances")),
    refetchInterval: 10_000,
  })
  const d = q.data
  const name = (id: number) => playfields.data?.get(id) ?? `Playfield ${id}`
  const rows = (d?.instances ?? [])
    .filter((i) => (mode === "all" || i.mode === mode) && (!withPlayers || i.players > 0))
    .toSorted(
      (a, b) =>
        modeOrder(a.mode) - modeOrder(b.mode) ||
        (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
        name(a.playfield).localeCompare(name(b.playfield)) ||
        a.copy - b.copy,
    )
  const players = d?.instances.reduce((n, i) => n + i.players, 0)
  const npcs = d?.instances.reduce((n, i) => n + i.npcs, 0)

  return (
    <>
      <PageHeader
        title="Instances"
        description="Every running copy of a world, in every game mode."
        actions={
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCwIcon data-icon="inline-start" className={q.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />
      {q.error ? (
        <ErrorAlert error={q.error} title="Can't load the instances" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="AI tick"
              value={d ? ms(d.ai_tick_ms) : <Skeleton className="h-8 w-20" />}
              hint={d && `Longest in the last minute: ${ms(d.ai_tick_max_ms)}`}
            />
            <Stat label="Copies running" value={d ? numberFormat.format(d.instances.length) : <Skeleton className="h-8 w-12" />} />
            <Stat
              label="Players / NPCs"
              value={d ? `${numberFormat.format(players ?? 0)} / ${numberFormat.format(npcs ?? 0)}` : <Skeleton className="h-8 w-20" />}
            />
            <Stat
              label="Open world cap"
              value={d ? numberFormat.format(d.open_world_cap) : <Skeleton className="h-8 w-12" />}
              hint="Players per copy before arrivals get another"
            />
          </div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <Tabs value={mode} onValueChange={setMode}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {MODES.map((m) => (
                  <TabsTrigger key={m} value={m}>
                    {modeName(m)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Switch id="with-players" checked={withPlayers} onCheckedChange={setWithPlayers} />
              <Label htmlFor="with-players">Only with players</Label>
            </div>
          </div>
          <Card>
            <CardContent>
              {!d ? (
                <div className="space-y-2">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </div>
              ) : rows.length === 0 ? (
                <Empty>No copy of a world matches.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>World</TableHead>
                      <TableHead className="text-right">Copy</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead className="text-right">Players</TableHead>
                      <TableHead className="text-right">NPCs</TableHead>
                      <TableHead className="text-right">Key</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((i) => (
                      <TableRow key={i.key}>
                        <TableCell className="font-medium">
                          {name(i.playfield)}
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{i.playfield}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{i.copy}</TableCell>
                        <TableCell>
                          <ModeBadge mode={i.mode} />
                        </TableCell>
                        <TableCell title={KIND_HINT[i.kind]}>
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge variant={i.kind === "main" ? "ghost" : "outline"}>{i.kind}</Badge>
                            {i.preview_owner != null && (
                              <Link to={`/characters/${i.preview_owner}`} className="text-xs underline-offset-4 hover:underline">
                                owner
                              </Link>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{numberFormat.format(i.players)}</TableCell>
                        <TableCell className="text-right tabular-nums" title={`${i.characters} characters in all`}>
                          {numberFormat.format(i.npcs)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{i.key}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
