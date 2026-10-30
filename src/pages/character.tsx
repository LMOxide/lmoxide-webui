import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, StarIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useParams } from "react-router"
import { toast } from "sonner"

import { api, unwrap } from "@/api/client"
import { Empty, ErrorAlert, Field, Fields, ModeBadge, PageHeader, PlayfieldName } from "@/components/common"
import { ConfirmDialog } from "@/components/moderation"
import { RenameCharacterDialog } from "@/components/rename-character"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth-context"
import { formatRelative, formatTime, modeName, numberFormat } from "@/lib/format"
import { useMinifigures, useTokens } from "@/lib/queries"

type Earned = NonNullable<Awaited<ReturnType<typeof loadCharacter>>>["achievements"][number]

const loadCharacter = (id: number) => unwrap(api.GET("/v1/characters/{id}", { params: { path: { id } } }))

/** "Paleontologist > Fiery Explorer", as the game shows it (else the client's internal name). */
const achievementLabel = (a: Earned) => (a.title ? `${a.group ? `${a.group} > ` : ""}${a.title}` : a.name)

/**
 * The character's achievements, with Remove (one) and Remove all for admins: to earn them again
 * while testing, or to fix a mistake. Tags that aren't achievements (story and tutorial
 * progress) are only counted, and always kept.
 */
function Achievements({ id, earned }: { id: number; earned: Earned[] }) {
  const queryClient = useQueryClient()
  const admin = useAuth().can("admin")
  const [q, setQ] = useState("")
  const achievements = earned.filter((a) => a.name).sort((a, b) => b.achieved_at - a.achieved_at)
  const progress = earned.length - achievements.length
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = achievements.filter((a) => {
    const hay = `${achievementLabel(a)} ${a.name} ${a.text ?? ""} ${a.id}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  const points = achievements.reduce((n, a) => n + a.points, 0)
  const remove = async (body: { ids?: number[]; all?: boolean }) => {
    const r = await unwrap(api.POST("/v1/characters/{id}/achievements/remove", { params: { path: { id } }, body }))
    toast.success(
      `Removed ${r.removed.length} achievement${r.removed.length === 1 ? "" : "s"}${r.online ? " (in game now)" : ""}${body.all && r.online ? ": counters reset after the next login" : ""}`,
    )
    await queryClient.invalidateQueries({ queryKey: ["character", id] })
  }
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Achievements</CardTitle>
        <CardDescription>
          {achievements.length} earned, {numberFormat.format(points)} points
          {progress > 0 && ` · ${progress} story and tutorial tag${progress === 1 ? "" : "s"} (always kept)`}
          {admin && ". Removing one also removes the earned “all of” achievement above it, so both can be earned again; stars and XP already given stay."}
        </CardDescription>
        {(achievements.length > 0) && (
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, text, id…" aria-label="Search achievements" />
            {admin && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline">
                    <Trash2Icon data-icon="inline-start" />
                    Remove all…
                  </Button>
                }
                title="Remove every achievement?"
                description={`All ${achievements.length} achievements, and the journal they come from (places found, enemies defeated, worlds visited) and the achievement counters, so they can all be earned again. Story and tutorial progress, stars and XP stay.`}
                action="Remove all"
                onConfirm={() => remove({ all: true })}
              />
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {achievements.length === 0 ? (
          <Empty>No achievements yet.</Empty>
        ) : !shown.length ? (
          <Empty>No achievement matches.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Achievement</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead>Earned</TableHead>
                {admin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">
                      {achievementLabel(a)} <span className="font-mono text-xs text-muted-foreground">[{a.id}]</span>
                    </div>
                    {a.text && <div className="text-xs text-muted-foreground">{a.text}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.points}</TableCell>
                  <TableCell className="text-sm text-muted-foreground" title={formatTime(a.achieved_at)}>
                    {a.achieved_at ? formatRelative(a.achieved_at) : "—"}
                  </TableCell>
                  {admin && (
                    <TableCell className="text-right">
                      <ConfirmDialog
                        trigger={
                          <Button size="sm" variant="ghost" aria-label={`Remove ${achievementLabel(a)}`}>
                            <Trash2Icon />
                          </Button>
                        }
                        title={`Remove “${achievementLabel(a)}”?`}
                        description="It can be earned again (a place's find is forgotten too). An earned “all of” achievement above it goes as well."
                        action="Remove"
                        onConfirm={() => remove({ ids: [a.id] })}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/** Bit numbers set in an upgrade mask. */
function bits(mask: number) {
  const out: number[] = []
  for (let i = 0; i < 32; i++) if (mask & (1 << i)) out.push(i)
  return out
}

export function CharacterPage() {
  const id = Number(useParams().id)
  const q = useQuery({
    queryKey: ["character", id],
    queryFn: () => loadCharacter(id),
  })
  const figs = useMinifigures().data
  const tokenInfo = useTokens().data
  const admin = useAuth().can("admin")
  const c = q.data
  const tokens = c
    ? Object.entries(c.tokens)
        .map(([k, v]) => ({ id: Number(k), info: tokenInfo?.get(Number(k)), ...v }))
        .sort((a, b) => a.id - b.id)
    : []
  // minifigures with upgrades or a rank that aren't in the team
  const others = c
    ? [...new Set([...Object.keys(c.upgrades), ...Object.keys(c.minifigure_ranks)].map(Number))]
        .filter((t) => !c.team.includes(t))
        .sort((a, b) => a - b)
    : []
  const figName = (t: number) => figs?.get(t)?.name ?? `Minifigure ${t}`
  /** Names of the upgrades set in a minifigure's mask, by bit. */
  const upgradeNames = (t: number) => {
    const upgrades = figs?.get(t)?.upgrades
    return bits(c?.upgrades[t] ?? 0).map((b) => upgrades?.find((u) => u.bit === b)?.name ?? `bit ${b}`)
  }

  return (
    <>
      <PageHeader
        title={c ? c.name || "On the creation screen" : "Character"}
        description={c && (
          <span className="flex items-center gap-2">
            <ModeBadge mode={c.mode} />
            <span className="flex items-center gap-1">
              <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
              {numberFormat.format(c.stars)} stars
            </span>
          </span>
        )}
        actions={
          c?.name &&
          admin && (
            <RenameCharacterDialog
              id={c.id}
              name={c.name}
              trigger={
                <Button variant="outline">
                  <PencilIcon data-icon="inline-start" />
                  Rename
                </Button>
              }
            />
          )
        }
      />
      {q.error && <ErrorAlert error={q.error} title="Can't load the character" />}
      {q.isPending && <Skeleton className="h-40" />}
      {c && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>As last saved.</CardDescription>
            </CardHeader>
            <CardContent>
              <Fields>
                <Field label="Character id">
                  <span className="font-mono">{c.id}</span>
                </Field>
                <Field label="Game mode">{modeName(c.mode)}</Field>
                <Field label="Where">
                  <PlayfieldName id={c.playfield} />
                </Field>
                <Field label="Position">
                  <span className="font-mono">{c.position.map((n) => n.toFixed(1)).join(", ")}</span>
                </Field>
                <Field label="Stars">{numberFormat.format(c.stars)}</Field>
                <Field label="Level">{c.level || <span className="text-muted-foreground">Not set</span>}</Field>
                <Field label="XP">{numberFormat.format(c.xp)}</Field>
              </Fields>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>Minifigures, the active one first.</CardDescription>
            </CardHeader>
            <CardContent>
              {c.team.length === 0 ? (
                <Empty>No minifigures.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Minifigure</TableHead>
                      <TableHead className="text-right">Rank</TableHead>
                      <TableHead>Upgrades</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.team.map((t, i) => (
                      <TableRow key={`${t}-${i}`}>
                        <TableCell>
                          <span className="flex items-center gap-2" title={`Template ${t}`}>
                            {figName(t)}
                            {i === 0 && <Badge variant="secondary">Active</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.minifigure_ranks[t] ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{upgradeNames(t).join(", ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {others.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Also minifigures not in the team:{" "}
                  {others
                    .map((t) => {
                      const rank = c.minifigure_ranks[t]
                      const details = [rank != null && `rank ${rank}`, ...upgradeNames(t)].filter(Boolean)
                      return details.length ? `${figName(t)} (${details.join(", ")})` : figName(t)
                    })
                    .join("; ")}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Tokens</CardTitle>
              <CardDescription>Minifigure parts gained and spent.</CardDescription>
            </CardHeader>
            <CardContent>
              {tokens.length === 0 ? (
                <Empty>No tokens.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Minifigure</TableHead>
                      <TableHead className="text-right">Gained</TableHead>
                      <TableHead className="text-right">Spent</TableHead>
                      <TableHead className="text-right">Held</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell title={`Token ${t.id}`}>
                          {t.info?.name ?? <span className="font-mono">{t.id}</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.info ? `${figName(t.info.minifigure)} · ${t.info.location}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{numberFormat.format(t.gained)}</TableCell>
                        <TableCell className="text-right tabular-nums">{numberFormat.format(t.spent)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {numberFormat.format(t.gained - t.spent)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Achievements id={c.id} earned={c.achievements} />
        </div>
      )}
    </>
  )
}
