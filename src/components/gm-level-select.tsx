import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGmLevels } from "@/lib/queries"

export function GmLevelSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // the server's thresholds (--moderator-gm-level, --admin-gm-level), from /v1/config
  const gm = useGmLevels()
  const levels: [number, string][] = [[0, "Player"]]
  if (gm.moderator > 0 && gm.moderator < gm.admin) levels.push([gm.moderator, `Moderator (GM ${gm.moderator})`])
  levels.push([gm.admin, `Admin (GM ${gm.admin})`])
  const known = levels.some(([l]) => l === value)
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {levels.map(([l, label]) => (
          <SelectItem key={l} value={String(l)}>
            {label}
          </SelectItem>
        ))}
        {!known && <SelectItem value={String(value)}>GM {value}</SelectItem>}
      </SelectContent>
    </Select>
  )
}
