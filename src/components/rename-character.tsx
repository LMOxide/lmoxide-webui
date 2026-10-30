import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { api, ApiError, errorMessage, unwrap } from "@/api/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
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

/** 1 to 3 words of up to 32 characters each (the server's rule). */
const nameProblem = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "Enter a name."
  if (words.length > 3) return "At most three words."
  if (words.some((w) => [...w].length > 32)) return "Each word is at most 32 characters."
  return null
}

/** Admins rename a character. One in play is renamed in the game at once (it is sent again
 * where it stands, so everyone sees the new name). */
export function RenameCharacterDialog({ id, name, trigger }: { id: number; name: string; trigger: ReactNode }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState(name)
  const problem = nameProblem(next)
  const m = useMutation({
    mutationFn: () => unwrap(api.PATCH("/v1/characters/{id}", { params: { path: { id } }, body: { name: next.trim() } })),
    onSuccess: (c) => {
      setOpen(false)
      toast.success(`Renamed to ${c.name}`)
      queryClient.setQueryData(["character", id], c)
      queryClient.invalidateQueries({ queryKey: ["account"] })
      queryClient.invalidateQueries({ queryKey: ["me"] })
      queryClient.invalidateQueries({ queryKey: ["players"] })
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setNext(name)
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
            if (!problem) m.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename {name || "character"}</DialogTitle>
            <DialogDescription>
              Created characters are named “first nick last”; other players see the nick above them. No other account's
              character may have the name. A character in play shows the new name at once.
            </DialogDescription>
          </DialogHeader>
          {m.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {m.error instanceof ApiError && m.error.status === 409
                  ? "Another account has a character with this name."
                  : errorMessage(m.error)}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="character-name">Name</Label>
            <Input
              id="character-name"
              required
              autoComplete="off"
              aria-invalid={problem != null && next !== name}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            {problem && next !== name && <p className="text-sm text-destructive">{problem}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={m.isPending || problem != null || next.trim() === name}>
              {m.isPending ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
