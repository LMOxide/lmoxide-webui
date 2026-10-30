import { PencilIcon } from "lucide-react"
import { Fragment } from "react"
import { Link } from "react-router"

import type { Schemas } from "@/api/client"
import { Empty, PlayfieldName } from "@/components/common"
import { RenameCharacterDialog } from "@/components/rename-character"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRelative, formatTime, modeName, modeOrder, numberFormat } from "@/lib/format"

type Character = Schemas["CharacterSummary"]

/** An account's characters, grouped by game mode (each mode has its own characters); with
 * `rename` (admins) a rename button on each named one. A character without a name is still on
 * the creation screen. */
export function CharactersTable({ characters, link, rename = false }: { characters: Character[]; link: boolean; rename?: boolean }) {
  if (characters.length === 0) return <Empty>No character yet: the player names one on the creation screen at the first login.</Empty>
  const columns = rename ? 5 : 4
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
          {rename && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...groups].map(([mode, list]) => (
          <Fragment key={mode}>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns} className="pt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {modeName(mode)}
              </TableCell>
            </TableRow>
            {list.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {link ? (
                    <Link to={`/characters/${c.id}`} className="underline-offset-4 hover:underline">
                      {c.name || <span className="text-muted-foreground italic">On the creation screen</span>}
                    </Link>
                  ) : (
                    c.name || <span className="text-muted-foreground italic">On the creation screen</span>
                  )}
                </TableCell>
                <TableCell>
                  <PlayfieldName id={c.playfield} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{numberFormat.format(c.stars)}</TableCell>
                <TableCell className="text-right" title={formatTime(c.saved_at)}>
                  {formatRelative(c.saved_at)}
                </TableCell>
                {rename && (
                  <TableCell className="text-right">
                    {c.name && (
                      <RenameCharacterDialog
                        id={c.id}
                        name={c.name}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Rename ${c.name}`} title="Rename">
                            <PencilIcon />
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
