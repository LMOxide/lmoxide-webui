import { BrowserRouter, Route, Routes } from "react-router"

import { Empty, PageHeader } from "@/components/common"
import { Layout } from "@/components/layout"
import { Require } from "@/components/require"
import { AccountPage } from "@/pages/account"
import { AccountsPage } from "@/pages/accounts"
import { ApiKeysPage } from "@/pages/api-keys"
import { AuditPage } from "@/pages/audit"
import { CharacterPage } from "@/pages/character"
import { ContentPage } from "@/pages/content"
import { LoginPage } from "@/pages/login"
import { MePage } from "@/pages/me"
import { PlayersPage } from "@/pages/players"
import { RegisterPage } from "@/pages/register"
import { ServerPage } from "@/pages/server"
import { StatusPage } from "@/pages/status"

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<StatusPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="me" element={<Require><MePage /></Require>} />
          <Route path="players" element={<Require scope="read"><PlayersPage /></Require>} />
          <Route path="accounts" element={<Require scope="read"><AccountsPage /></Require>} />
          <Route path="accounts/:id" element={<Require scope="read"><AccountPage /></Require>} />
          <Route path="characters/:id" element={<Require scope="read"><CharacterPage /></Require>} />
          <Route path="server" element={<Require scope="moderate"><ServerPage /></Require>} />
          <Route path="api-keys" element={<Require scope="admin"><ApiKeysPage /></Require>} />
          <Route path="audit" element={<Require scope="admin"><AuditPage /></Require>} />
          <Route path="content" element={<Require scope="admin"><ContentPage /></Require>} />
          <Route
            path="*"
            element={
              <>
                <PageHeader title="Not found" />
                <Empty>There's no page here.</Empty>
              </>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
