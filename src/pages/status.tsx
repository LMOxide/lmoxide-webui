import { useQuery } from "@tanstack/react-query"
import { ConstructionIcon, UsersIcon } from "lucide-react"
import { Link } from "react-router"

import { api, unwrap } from "@/api/client"
import { Empty, ErrorAlert, PageHeader, PlayfieldName, Stat } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth-context"
import { formatSince, formatTime } from "@/lib/format"
import { useConfig, useStatus } from "@/lib/queries"

export function StatusPage() {
  const { session } = useAuth()
  const status = useStatus()
  const config = useConfig()
  const online = useQuery({
    queryKey: ["online"],
    queryFn: () => unwrap(api.GET("/v1/online")),
    refetchInterval: 15_000,
    enabled: status.data?.game_server_online === true,
  })
  const s = status.data
  const up = s?.game_server_online

  return (
    <>
      <PageHeader
        title="Server status"
        description="LEGO Minifigures Online, served by LMOxide."
        actions={
          !session &&
          config.data?.registration_open && (
            <Button asChild variant="outline">
              <Link to="/register">Create an account</Link>
            </Button>
          )
        }
      />
      {status.error ? (
        <ErrorAlert error={status.error} title="Can't load the server status" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Game server"
            value={
              !s ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <span className="flex items-center gap-2">
                  <span className={up ? "size-2.5 rounded-full bg-emerald-500" : "size-2.5 rounded-full bg-destructive"} />
                  {up ? "Online" : "Offline"}
                </span>
              )
            }
          />
          <Stat label="Players online" value={s ? (s.players_online ?? "—") : <Skeleton className="h-8 w-12" />} />
          <Stat
            label="Uptime"
            value={s ? formatSince(s.started_at) : <Skeleton className="h-8 w-20" />}
            hint={s?.started_at ? `since ${formatTime(s.started_at)}` : undefined}
          />
          <Stat label="Version" value={s ? (s.version ?? "—") : <Skeleton className="h-8 w-16" />} />
        </div>
      )}

      {s?.maintenance && (
        <Alert className="mt-4">
          <ConstructionIcon />
          <AlertTitle>Maintenance</AlertTitle>
          <AlertDescription>{s.maintenance_message || "Only staff can log in right now."}</AlertDescription>
        </Alert>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" /> Who's online
          </CardTitle>
        </CardHeader>
        <CardContent>
          {s && !up ? (
            <Empty>The game server is offline.</Empty>
          ) : online.error ? (
            <ErrorAlert error={online.error} title="Can't load who's online" />
          ) : !online.data ? (
            <div className="space-y-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : online.data.length === 0 ? (
            <Empty>Nobody is playing right now.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Minifigure</TableHead>
                  <TableHead>Where</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {online.data
                  .toSorted((a, b) => a.character_name.localeCompare(b.character_name))
                  .map((p) => (
                    <TableRow key={p.character_name}>
                      <TableCell className="font-medium">{p.character_name}</TableCell>
                      <TableCell>
                        <PlayfieldName id={p.playfield} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
