import { Link } from "react-router"

import type { Schemas } from "@/api/client"
import { Empty, PlayfieldName } from "@/components/common"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRelative, formatTime, numberFormat } from "@/lib/format"

export function CharactersTable({ characters, link }: { characters: Schemas["CharacterSummary"][]; link: boolean }) {
  if (characters.length === 0) return <Empty>No character yet: it's made on the first login in the game.</Empty>
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
        {characters.map((c) => (
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
      </TableBody>
    </Table>
  )
}
