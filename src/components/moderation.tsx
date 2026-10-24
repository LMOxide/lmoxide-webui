import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { api, errorMessage, unwrap, type Account } from "@/api/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

/** A yes/no question before something that can't be undone; stays open while it runs. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  action,
  onConfirm,
}: {
  trigger: ReactNode
  title: string
  description: ReactNode
  action: string
  onConfirm: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const m = useMutation({ mutationFn: onConfirm, onSuccess: () => setOpen(false) })
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) m.reset()
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {m.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(m.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={m.isPending}
            onClick={(e) => {
              e.preventDefault()
              m.mutate()
            }}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function KickDialog({ accountId, name, trigger }: { accountId: number; name: string; trigger: ReactNode }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const m = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/players/{account_id}/kick", {
          params: { path: { account_id: accountId } },
          body: { reason: reason.trim() || null },
        }),
      ),
    onSuccess: (r) => {
      setOpen(false)
      toast.success(r.affected ? `Kicked ${name}` : `${name} wasn't online`)
      queryClient.invalidateQueries({ queryKey: ["players"] })
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setReason("")
          m.reset()
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            m.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>Kick {name}</DialogTitle>
            <DialogDescription>Disconnects them from the game; they can log in again.</DialogDescription>
          </DialogHeader>
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(m.error)}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="kick-reason">Reason (optional, shown to them in chat)</Label>
            <Input id="kick-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={m.isPending}>
              Kick
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const DURATIONS = [
  ["1", "1 day"],
  ["3", "3 days"],
  ["7", "1 week"],
  ["30", "30 days"],
  ["90", "90 days"],
  ["custom", "Other…"],
  ["permanent", "Permanent"],
] as const

export function BanDialog({
  accountId,
  name,
  trigger,
  onBanned,
}: {
  accountId: number
  name: string
  trigger: ReactNode
  onBanned?: (a: Account) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState("7")
  const [customDays, setCustomDays] = useState("14")
  const [reason, setReason] = useState("")
  const days = duration === "permanent" ? null : Number(duration === "custom" ? customDays : duration)
  const m = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/accounts/{id}/ban", {
          params: { path: { id: accountId } },
          body: { days, reason: reason.trim() || null },
        }),
      ),
    onSuccess: (a) => {
      setOpen(false)
      toast.success(`Banned ${name}`)
      queryClient.setQueryData(["account", accountId], a)
      queryClient.invalidateQueries({ queryKey: ["accounts"] })
      queryClient.invalidateQueries({ queryKey: ["players"] })
      onBanned?.(a)
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setDuration("7")
          setReason("")
          m.reset()
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            m.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>Ban {name}</DialogTitle>
            <DialogDescription>They're disconnected and can't log in until the ban ends.</DialogDescription>
          </DialogHeader>
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(m.error)}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Length</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {duration === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="ban-days">Days</Label>
                <Input
                  id="ban-days"
                  type="number"
                  min={1}
                  required
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ban-reason">Reason (optional)</Label>
            <Textarea id="ban-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={m.isPending}>
              {days == null ? "Ban permanently" : `Ban for ${days} day${days === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
