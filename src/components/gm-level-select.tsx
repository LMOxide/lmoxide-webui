import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// the server's defaults (--moderator-gm-level 1, --admin-gm-level 2)
const LEVELS = [
  [0, "Player"],
  [1, "Moderator (GM 1)"],
  [2, "Admin (GM 2)"],
] as const

export function GmLevelSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const known = LEVELS.some(([l]) => l === value)
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEVELS.map(([l, label]) => (
          <SelectItem key={l} value={String(l)}>
            {label}
          </SelectItem>
        ))}
        {!known && <SelectItem value={String(value)}>GM {value}</SelectItem>}
      </SelectContent>
    </Select>
  )
}
