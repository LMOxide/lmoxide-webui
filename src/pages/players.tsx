import { useQuery } from "@tanstack/react-query"
import { BanIcon, LogOutIcon, RefreshCwIcon } from "lucide-react"
import { Link } from "react-router"

import { api, unwrap } from "@/api/client"
import { Empty, ErrorAlert, GmBadge, PageHeader, PlayfieldName } from "@/components/common"
import { BanDialog, KickDialog } from "@/components/moderation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth-context"
import { formatSince, formatTime } from "@/lib/format"

export function PlayersPage() {
  const { can } = useAuth()
  const players = useQuery({
    queryKey: ["players"],
    queryFn: () => unwrap(api.GET("/v1/players")),
    refetchInterval: 10_000,
  })
  const moderate = can("moderate")

  return (
    <>
      <PageHeader
        title="Players online"
        description={players.data ? `${players.data.length} logged in` : undefined}
        actions={
          <Button variant="outline" size="sm" onClick={() => players.refetch()} disabled={players.isFetching}>
            <RefreshCwIcon data-icon="inline-start" className={players.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />
      {players.error ? (
        <ErrorAlert error={players.error} title="Can't load the players" />
      ) : (
        <Card>
          <CardContent>
            {!players.data ? (
              <div className="space-y-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : players.data.length === 0 ? (
              <Empty>Nobody is logged in.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Minifigure</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Where</TableHead>
                    <TableHead>Online for</TableHead>
                    {moderate && <TableHead className="w-0" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.data
                    .toSorted((a, b) => a.character_name.localeCompare(b.character_name))
                    .map((p) => (
                      <TableRow key={p.account_id}>
                        <TableCell className="font-medium">
                          <Link to={`/characters/${p.character_id}`} className="underline-offset-4 hover:underline">
                            {p.character_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Link to={`/accounts/${p.account_id}`} className="underline-offset-4 hover:underline">
                              {p.username}
                            </Link>
                            <GmBadge level={p.gm_level} />
                          </span>
                        </TableCell>
                        <TableCell>
                          <PlayfieldName id={p.playfield} />
                        </TableCell>
                        <TableCell title={formatTime(p.logged_in_at)}>{formatSince(p.logged_in_at)}</TableCell>
                        {moderate && (
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <KickDialog
                                accountId={p.account_id}
                                name={p.character_name}
                                trigger={
                                  <Button variant="ghost" size="sm">
                                    <LogOutIcon data-icon="inline-start" />
                                    Kick
                                  </Button>
                                }
                              />
                              <BanDialog
                                accountId={p.account_id}
                                name={p.username}
                                trigger={
                                  <Button variant="ghost" size="sm" className="text-destructive">
                                    <BanIcon data-icon="inline-start" />
                                    Ban
                                  </Button>
                                }
                              />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
