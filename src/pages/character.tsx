import { useQuery } from "@tanstack/react-query"
import { StarIcon } from "lucide-react"
import { useParams } from "react-router"

import { api, unwrap } from "@/api/client"
import { Empty, ErrorAlert, Field, Fields, PageHeader, PlayfieldName } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { numberFormat } from "@/lib/format"

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
    queryFn: () => unwrap(api.GET("/v1/characters/{id}", { params: { path: { id } } })),
  })
  const c = q.data
  const tokens = c ? Object.entries(c.tokens).map(([k, v]) => ({ id: Number(k), ...v })).sort((a, b) => a.id - b.id) : []
  const upgrades = c ? Object.entries(c.upgrades).map(([k, v]) => ({ template: Number(k), mask: v })) : []

  return (
    <>
      <PageHeader
        title={c?.name ?? "Character"}
        description={c && (
          <span className="flex items-center gap-1">
            <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
            {numberFormat.format(c.stars)} stars
          </span>
        )}
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
                <Field label="Where">
                  <PlayfieldName id={c.playfield} />
                </Field>
                <Field label="Position">
                  <span className="font-mono">{c.position.map((n) => n.toFixed(1)).join(", ")}</span>
                </Field>
                <Field label="Stars">{numberFormat.format(c.stars)}</Field>
              </Fields>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>Minifigure templates, the active one first.</CardDescription>
            </CardHeader>
            <CardContent>
              {c.team.length === 0 ? (
                <Empty>No minifigures.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Minifigure</TableHead>
                      <TableHead>Upgrades</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.team.map((t, i) => (
                      <TableRow key={`${t}-${i}`}>
                        <TableCell>
                          <span className="flex items-center gap-2 font-mono">
                            {t}
                            {i === 0 && <Badge variant="secondary">Active</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {c.upgrades[t] ? bits(c.upgrades[t]).join(", ") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {upgrades.some((u) => !c.team.includes(u.template)) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Also upgrades for templates not in the team:{" "}
                  {upgrades
                    .filter((u) => !c.team.includes(u.template))
                    .map((u) => `${u.template} (${bits(u.mask).join(", ")})`)
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
                      <TableHead className="text-right">Gained</TableHead>
                      <TableHead className="text-right">Spent</TableHead>
                      <TableHead className="text-right">Held</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono">{t.id}</TableCell>
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
        </div>
      )}
    </>
  )
}
