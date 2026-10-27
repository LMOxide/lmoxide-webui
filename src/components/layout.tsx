import { LogInIcon, LogOutIcon, MenuIcon, MonitorIcon, MoonIcon, SunIcon, UserIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router"
import { toast } from "sonner"

import type { ApiScope } from "@/api/client"
import { GmBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

const NAV: { to: string; label: string; scope?: ApiScope }[] = [
  { to: "/", label: "Status" },
  { to: "/players", label: "Players", scope: "read" },
  { to: "/accounts", label: "Accounts", scope: "read" },
  { to: "/server", label: "Server", scope: "moderate" },
  { to: "/api-keys", label: "API keys", scope: "admin" },
  { to: "/audit", label: "Audit log", scope: "admin" },
  { to: "/content", label: "World content", scope: "admin" },
]

function NavLinks({ vertical, onNavigate }: { vertical?: boolean; onNavigate?: () => void }) {
  const { can } = useAuth()
  return (
    <nav className={cn("flex gap-1", vertical && "flex-col")}>
      {NAV.filter((n) => !n.scope || can(n.scope)).map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              isActive && "bg-muted text-foreground",
            )
          }
        >
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <SunIcon /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const { account, logout } = useAuth()
  const navigate = useNavigate()
  if (!account)
    return (
      <Button asChild size="sm">
        <Link to="/login">
          <LogInIcon data-icon="inline-start" />
          Log in
        </Link>
      </Button>
    )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <UserIcon data-icon="inline-start" />
          <span className="max-w-32 truncate">{account.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span className="truncate">{account.username}</span>
          <GmBadge level={account.gm_level} />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/me">
            <UserIcon /> My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            try {
              await logout()
            } catch {
              // the local session is gone either way
            }
            toast.success("Logged out")
            navigate("/")
          }}
        >
          <LogOutIcon /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle>LMOxide</SheetTitle>
              </SheetHeader>
              <div className="px-2">
                <NavLinks vertical onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Link to="/" className="flex items-center gap-2 font-heading font-semibold">
            <img src="/logo-128.png" alt="" className="size-8" />
            <span className="hidden sm:inline">LMOxide</span>
          </Link>
          <div className="hidden md:block">
            <NavLinks />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeMenu />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
