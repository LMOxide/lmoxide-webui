import { useInfiniteQuery } from "@tanstack/react-query"
import { RefreshCwIcon } from "lucide-react"

import { api, unwrap } from "@/api/client"
import { Empty, ErrorAlert, PageHeader } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRelative, formatTime } from "@/lib/format"

const PAGE = 100

export function AuditPage() {
  const q = useInfiniteQuery({
    queryKey: ["audit"],
    queryFn: ({ pageParam }) =>
      unwrap(api.GET("/v1/audit", { params: { query: { limit: PAGE, before: pageParam } } })),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last[last.length - 1].id),
  })
  const entries = q.data?.pages.flat() ?? []

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Administrative actions, newest first."
        actions={
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCwIcon data-icon="inline-start" className={q.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />
      {q.error ? (
        <ErrorAlert error={q.error} title="Can't load the audit log" />
      ) : (
        <Card>
          <CardContent>
            {!q.data ? (
              <Skeleton className="h-40" />
            ) : entries.length === 0 ? (
              <Empty>Nothing yet.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap" title={formatTime(e.at)}>
                        {formatRelative(e.at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.actor}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {e.action}
                        </Badge>
                      </TableCell>
                      <TableCell>{e.target ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="max-w-80 truncate text-muted-foreground" title={e.details ?? undefined}>
                        {e.details ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      {q.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? "Loading…" : "Load older"}
          </Button>
        </div>
      )}
    </>
  )
}
