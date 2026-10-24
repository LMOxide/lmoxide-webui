import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { api, errorMessage, unwrap } from "@/api/client"
import { BanBadge, Empty, ErrorAlert, GmBadge, PageHeader } from "@/components/common"
import { PasswordInput } from "@/components/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { GmLevelSelect } from "@/components/gm-level-select"
import { useAuth } from "@/lib/auth-context"
import { formatRelative, formatTime } from "@/lib/format"
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_HINT, USERNAME_PATTERN } from "@/lib/rules"

const PAGE = 50

function CreateAccount() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [gmLevel, setGmLevel] = useState(0)
  const m = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/accounts", {
          body: { username: username.trim(), password: password || null, gm_level: gmLevel },
        }),
      ),
    onSuccess: (a) => {
      setOpen(false)
      toast.success(`Created ${a.username}`)
      queryClient.invalidateQueries({ queryKey: ["accounts"] })
      navigate(`/accounts/${a.id}`)
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setUsername("")
          setPassword("")
          setGmLevel(0)
          m.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          New account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            m.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
            <DialogDescription>Without a password it can't log in until one is set.</DialogDescription>
          </DialogHeader>
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(m.error)}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              required
              autoComplete="off"
              pattern={USERNAME_PATTERN}
              title={USERNAME_HINT}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{USERNAME_HINT}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <GmLevelSelect value={gmLevel} onChange={setGmLevel} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={m.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AccountsPage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const search = params.get("q") ?? ""
  const offset = Math.max(0, Number(params.get("offset")) || 0)
  const [text, setText] = useState(search)

  // search as you type, a moment after the last key
  useEffect(() => {
    if (text === search) return
    const t = setTimeout(
      () =>
        setParams((p) => {
          if (text) p.set("q", text)
          else p.delete("q")
          p.delete("offset")
          return p
        }, { replace: true }),
      300,
    )
    return () => clearTimeout(t)
  }, [text, search, setParams])

  const accounts = useQuery({
    queryKey: ["accounts", search, offset],
    queryFn: () =>
      unwrap(api.GET("/v1/accounts", { params: { query: { search: search || null, offset, limit: PAGE } } })),
    placeholderData: keepPreviousData,
  })
  const page = (o: number) =>
    setParams((p) => {
      if (o) p.set("offset", String(o))
      else p.delete("offset")
      return p
    })

  return (
    <>
      <PageHeader title="Accounts" actions={can("admin") && <CreateAccount />} />
      <div className="relative mb-4 max-w-sm">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search usernames"
          className="pl-8"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {accounts.error ? (
        <ErrorAlert error={accounts.error} title="Can't load the accounts" />
      ) : (
        <Card>
          <CardContent>
            {!accounts.data ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : accounts.data.length === 0 ? (
              <Empty>{search ? `No usernames contain "${search}".` : "No accounts."}</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Minifigure</TableHead>
                    <TableHead>Last game login</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.data.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <Link to={`/accounts/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                            {a.username}
                          </Link>
                          <GmBadge level={a.gm_level} />
                          <BanBadge ban={a.ban} />
                        </span>
                      </TableCell>
                      <TableCell>{a.characters.map((c) => c.name).join(", ") || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell title={formatTime(a.last_login_at)}>
                        {a.last_login_at ? formatRelative(a.last_login_at) : <span className="text-muted-foreground">Never</span>}
                      </TableCell>
                      <TableCell title={formatTime(a.created_at)}>{formatRelative(a.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      {accounts.data && (offset > 0 || accounts.data.length === PAGE) && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>
            {offset + 1}–{offset + accounts.data.length}
          </span>
          <Button variant="outline" size="icon-sm" disabled={offset === 0} onClick={() => page(Math.max(0, offset - PAGE))} aria-label="Previous page">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={accounts.data.length < PAGE} onClick={() => page(offset + PAGE)} aria-label="Next page">
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </>
  )
}
