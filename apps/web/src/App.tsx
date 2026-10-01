import { Component, type ReactNode } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import { DesktopOnlyGate } from "@/components/layout/DesktopOnlyGate"
import { AppShell } from "@/components/layout/AppShell"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { useSession } from "@/lib/auth"
import { useStudio } from "@/lib/db"
import { CatalogPage } from "@/pages/CatalogPage"
import { LoginPage } from "@/pages/LoginPage"
import { NewSimulationPage } from "@/pages/NewSimulationPage"
import { ProjectPage } from "@/pages/ProjectPage"
import { ProjectsPage } from "@/pages/ProjectsPage"
import { SimulatePage } from "@/pages/SimulatePage"

function RequireAuth() {
  const session = useSession()
  if (!session) return <Navigate to="/entrar" replace />
  return <Outlet />
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message }
  }

  render() {
    if (this.state.message) {
      return (
        <main className="mx-auto max-w-lg px-4 py-16">
          <h1 className="font-display text-4xl">Algo quebrou no estúdio</h1>
          <p className="mt-3 text-sm text-muted-foreground">{this.state.message}</p>
        </main>
      )
    }
    return this.props.children
  }
}

export function App() {
  return (
    <ThemeProvider>
      <DesktopOnlyGate>
        <StudioApp />
      </DesktopOnlyGate>
    </ThemeProvider>
  )
}

function StudioApp() {
  const studio = useStudio()

  if (!studio.ready) {
    return (
      <p className="grid min-h-svh place-items-center px-6 text-sm text-muted-foreground">
        Abrindo o estúdio local…
      </p>
    )
  }

  return (
    <AppErrorBoundary>
      {studio.error ? (
        <p className="bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">{studio.error}</p>
      ) : null}
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/simular/nova" element={<NewSimulationPage />} />
              <Route path="/simular/:projectId" element={<SimulatePage />} />
              <Route path="/projetos/:projectId" element={<ProjectPage />} />
              <Route path="/catalogo" element={<CatalogPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" />
    </AppErrorBoundary>
  )
}
