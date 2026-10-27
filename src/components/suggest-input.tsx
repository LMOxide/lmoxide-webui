import { XIcon } from "lucide-react"
import { useId, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface Suggestion {
  /** what is stored when it is picked */
  value: string
  /** shown instead of the value */
  label?: string
  /** shown beside it */
  detail?: string
}

const LIMIT = 30

/** The suggestions with every typed word in their value or label ("pirate dock"). */
function matching(options: Suggestion[], text: string, exclude: string[] = []) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  return options
    .filter((o) => !exclude.includes(o.value))
    .filter((o) => {
      const hay = `${o.value} ${o.label ?? ""}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .slice(0, LIMIT)
}

/** The dropdown under an input: arrow keys move, Enter or a click picks. */
function SuggestList({ id, items, active, onPick }: { id: string; items: Suggestion[]; active: number; onPick: (s: Suggestion) => void }) {
  return (
    <ul id={id} role="listbox" className="absolute top-full left-0 z-50 mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md">
      {items.map((s, i) => (
        <li
          key={s.value}
          role="option"
          aria-selected={i === active}
          className={cn("flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1", i === active && "bg-accent text-accent-foreground")}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(s)
          }}
        >
          <span className="truncate">{s.label ?? s.value}</span>
          {s.detail && <span className="shrink-0 truncate text-xs text-muted-foreground">{s.detail}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Keyboard handling shared by both inputs. */
function useList(items: Suggestion[]) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  /** Whether it handled the key. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, pick: (s: Suggestion) => void) => {
    if (!open || !items.length) return false
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((active + 1) % items.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((active + items.length - 1) % items.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      pick(items[Math.min(active, items.length - 1)])
    } else if (e.key === "Escape") setOpen(false)
    else return false
    return true
  }
  return { open, setOpen, active: Math.min(active, Math.max(0, items.length - 1)), setActive, onKeyDown }
}

/**
 * A text box that suggests values as you type (every word matches anywhere). Free text is kept
 * as typed; picking a suggestion stores its value.
 */
export function SuggestInput({
  value,
  onChange,
  options,
  placeholder,
  onType,
  className,
  "aria-label": ariaLabel,
  id,
}: {
  value: string
  onChange: (v: string) => void
  options: Suggestion[]
  placeholder?: string
  /** told what is typed (to fetch more suggestions) */
  onType?: (text: string) => void
  className?: string
  "aria-label"?: string
  id?: string
}) {
  const listId = useId()
  const items = useMemo(() => matching(options, value).filter((o) => o.value !== value), [options, value])
  const list = useList(items)
  const pick = (s: Suggestion) => {
    onChange(s.value)
    list.setOpen(false)
  }
  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={list.open && items.length > 0}
        aria-controls={listId}
        autoComplete="off"
        className={value ? "pr-7" : undefined}
        onFocus={() => {
          list.setOpen(true)
          onType?.(value)
        }}
        onBlur={() => list.setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value)
          onType?.(e.target.value)
          list.setOpen(true)
          list.setActive(0)
        }}
        onKeyDown={(e) => list.onKeyDown(e, pick)}
      />
      {value && (
        <button type="button" aria-label="Clear" className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => onChange("")}>
          <XIcon className="size-3.5" />
        </button>
      )}
      {list.open && items.length > 0 && <SuggestList id={listId} items={items} active={list.active} onPick={pick} />}
    </div>
  )
}

/**
 * Several values as removable chips, with suggestions as you type. Enter or a comma adds what is
 * typed (or the highlighted suggestion); Backspace in an empty box removes the last chip.
 */
export function TokenInput({
  values,
  onChange,
  options,
  placeholder,
  format = (v) => v,
  tidy = (v) => v.trim(),
  onType,
  "aria-label": ariaLabel,
  id,
}: {
  values: string[]
  onChange: (v: string[]) => void
  options: Suggestion[]
  placeholder?: string
  /** how a chip shows a value ("#todo") */
  format?: (v: string) => string
  /** what a typed value becomes ("" drops it) */
  tidy?: (v: string) => string
  onType?: (text: string) => void
  "aria-label"?: string
  id?: string
}) {
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState("")
  const items = useMemo(() => matching(options, text, values), [options, text, values])
  const add = (raw: string) => {
    const v = tidy(raw)
    if (v && !values.includes(v)) onChange([...values, v])
    setText("")
    onType?.("")
  }
  const list = useList(items)
  return (
    <div
      className="relative flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
      onClick={() => input.current?.focus()}
    >
      {values.map((v) => (
        <Badge key={v} variant="secondary" className="gap-0.5 pr-1">
          {format(v)}
          <button type="button" aria-label={`Remove ${format(v)}`} className="rounded hover:text-foreground" onClick={() => onChange(values.filter((x) => x !== v))}>
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        ref={input}
        id={id}
        value={text}
        placeholder={values.length ? undefined : placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={list.open && items.length > 0}
        aria-controls={listId}
        autoComplete="off"
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        onFocus={() => {
          list.setOpen(true)
          onType?.(text)
        }}
        onBlur={() => {
          list.setOpen(false)
          if (text.trim()) add(text)
        }}
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(",")) return add(v.slice(0, -1))
          setText(v)
          onType?.(v)
          list.setOpen(true)
          list.setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (!list.open || !items.length || !text.trim()) && text.trim()) {
            e.preventDefault()
            return add(text)
          }
          if (list.onKeyDown(e, (s) => add(s.value))) return
          if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1))
        }}
      />
      {list.open && items.length > 0 && <SuggestList id={listId} items={items} active={list.active} onPick={(s) => add(s.value)} />}
    </div>
  )
}
