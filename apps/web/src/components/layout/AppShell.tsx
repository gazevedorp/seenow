import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSession, auth } from "@/lib/auth"

export function AppShell() {
  const session = useSession()
  const navigate = useNavigate()

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <NavLink to="/" className="font-display text-[1.7rem] leading-none tracking-tight">
            SEENOW
          </NavLink>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5",
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              Simulações
            </NavLink>
            <NavLink
              to="/catalogo"
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5",
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              Catálogo
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Badge variant="secondary">Demonstração</Badge>
            <span className="hidden text-sm text-muted-foreground md:inline">
              {session?.organizationName}
            </span>
            <span className="hidden text-sm sm:inline">{session?.fullName}</span>
            <Button
              variant="ghost"
              onClick={() => {
                auth.logout()
                navigate("/entrar")
              }}
            >
              Sair
            </Button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
