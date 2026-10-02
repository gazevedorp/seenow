import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { ImagesIcon, LogOutIcon, SwatchBookIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShellBreadcrumb } from "@/components/layout/ShellBreadcrumb"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { useSession, auth } from "@/lib/auth"
import { usePipelineStatus } from "@/lib/pipeline/api"

const NAV = [
  { to: "/", label: "Simulações", icon: ImagesIcon },
  { to: "/catalogo", label: "Catálogo", icon: SwatchBookIcon },
] as const

function sectionActive(pathname: string, to: string) {
  if (to === "/catalogo") return pathname.startsWith("/catalogo")
  return pathname === "/" || pathname.startsWith("/simular") || pathname.startsWith("/projetos")
}

export function AppShell() {
  const session = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pipeline = usePipelineStatus()
  const pipelineLabel = !pipeline
    ? "Lendo provedores…"
    : pipeline.segmentation.configured
      ? pipeline.segmentation.label
      : "Sem SegFormer"

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-12 items-center px-4">
          <Link to="/" className="font-display text-xl leading-none tracking-tight">
            SEENOW
          </Link>
        </div>
        <nav aria-label="Seções" className="flex flex-1 flex-col gap-0.5 px-2">
          <p className="px-2.5 pt-2 pb-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Estúdio</p>
          {NAV.map((item) => {
            const active = sectionActive(pathname, item.to)
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? (pathname === item.to ? "page" : true) : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto space-y-3 border-t border-sidebar-border p-3">
          <Badge variant="secondary" title={pipeline?.segmentation.label ?? ""} className="max-w-full">
            <span className="min-w-0 truncate">{pipelineLabel}</span>
          </Badge>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{session?.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{session?.organizationName}</p>
            </div>
            <ThemeToggle />
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start px-2"
            onClick={() => {
              auth.logout()
              navigate("/entrar")
            }}
          >
            <LogOutIcon />
            Sair
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center border-b bg-background/90 px-4 backdrop-blur-md lg:px-6">
          <ShellBreadcrumb />
        </header>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
