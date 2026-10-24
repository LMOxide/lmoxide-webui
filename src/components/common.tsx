import { AlertCircleIcon, ShieldIcon, ShieldCheckIcon } from "lucide-react"
import type { ReactNode } from "react"

import { errorMessage, type Schemas } from "@/api/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatTime } from "@/lib/format"
import { useGmLevels, usePlayfields } from "@/lib/queries"

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorAlert({ error, title = "Something went wrong" }: { error: unknown; title?: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{errorMessage(error)}</AlertDescription>
    </Alert>
  )
}

/** Moderator/admin badge for an account's GM level (thresholds from `/v1/config`); nothing for players. */
export function GmBadge({ level }: { level: number }) {
  const gm = useGmLevels()
  if (level <= 0) return null
  if (level >= gm.admin)
    return (
      <Badge>
        <ShieldCheckIcon data-icon="inline-start" />
        Admin{level > gm.admin ? ` (GM ${level})` : ""}
      </Badge>
    )
  if (level >= gm.moderator)
    return (
      <Badge variant="secondary">
        <ShieldIcon data-icon="inline-start" />
        Moderator{level > gm.moderator ? ` (GM ${level})` : ""}
      </Badge>
    )
  // staff in the game, but no scope in the API
  return <Badge variant="outline">GM {level}</Badge>
}

export function BanBadge({ ban }: { ban: Schemas["BanInfo"] | null | undefined }) {
  if (!ban) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive">Banned{ban.until == null ? " permanently" : ""}</Badge>
      </TooltipTrigger>
      <TooltipContent>
        {ban.until == null ? "Permanent" : `Until ${formatTime(ban.until)}`}
        {ban.reason ? ` — ${ban.reason}` : ""}
      </TooltipContent>
    </Tooltip>
  )
}

export function PlayfieldName({ id }: { id: number | null | undefined }) {
  const { data } = usePlayfields()
  if (id == null) return <span className="text-muted-foreground">Loading in…</span>
  return <>{data?.get(id) ?? `Playfield ${id}`}</>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>
}

/** A label/value list for detail cards: `<Fields><Field label="…">…</Field></Fields>`. */
export function Fields({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">{children}</dl>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}
