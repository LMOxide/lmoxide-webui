import { Fragment } from "react"
import { Link } from "react-router"

import type { Schemas } from "@/api/client"
import { Empty, PlayfieldName } from "@/components/common"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRelative, formatTime, modeName, modeOrder, numberFormat } from "@/lib/format"

type Character = Schemas["CharacterSummary"]

/** An account's characters, grouped by game mode (each mode has its own characters). */
export function CharactersTable({ characters, link }: { characters: Character[]; link: boolean }) {
  if (characters.length === 0) return <Empty>No character yet: it's made on the first login in the game.</Empty>
  const groups = new Map<string, Character[]>()
  for (const c of characters.toSorted((a, b) => modeOrder(a.mode) - modeOrder(b.mode) || a.name.localeCompare(b.name))) {
    groups.set(c.mode, [...(groups.get(c.mode) ?? []), c])
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Where</TableHead>
          <TableHead className="text-right">Stars</TableHead>
          <TableHead className="text-right">Last saved</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...groups].map(([mode, list]) => (
          <Fragment key={mode}>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="pt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {modeName(mode)}
              </TableCell>
            </TableRow>
            {list.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {link ? (
                    <Link to={`/characters/${c.id}`} className="underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                  ) : (
                    c.name
                  )}
                </TableCell>
                <TableCell>
                  <PlayfieldName id={c.playfield} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{numberFormat.format(c.stars)}</TableCell>
                <TableCell className="text-right" title={formatTime(c.saved_at)}>
                  {formatRelative(c.saved_at)}
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
