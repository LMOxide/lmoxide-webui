import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router"

import type { ApiScope } from "@/api/client"
import { Empty, PageHeader } from "@/components/common"
import { useAuth } from "@/lib/auth-context"

/** Logged in (and with `scope`, if given), else to the login page or a "not allowed" note. */
export function Require({ scope, children }: { scope?: ApiScope; children: ReactNode }) {
  const { session, can } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (scope && !can(scope))
    return (
      <>
        <PageHeader title="Not allowed" />
        <Empty>Your account can't see this page.</Empty>
      </>
    )
  return children
}
