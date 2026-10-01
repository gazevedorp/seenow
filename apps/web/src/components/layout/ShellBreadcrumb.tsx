import { Link, useLocation, useParams } from "react-router-dom"
import { ChevronRightIcon } from "lucide-react"
import { useStudio } from "@/lib/db"

type Crumb = {
  label: string
  to?: string
}

function buildCrumbs(pathname: string, projectId: string | undefined, studio: ReturnType<typeof useStudio>): Crumb[] {
  if (pathname === "/catalogo") return [{ label: "Catálogo" }]
  if (pathname === "/simular/nova") return [{ label: "Simulações", to: "/" }, { label: "Nova simulação" }]

  const onProject = pathname.startsWith("/projetos/")
  const onSimulation = pathname.startsWith("/simular/")
  if ((onProject || onSimulation) && projectId) {
    const project = studio.projects.find((item) => item.id === projectId)
    const client = studio.clients.find((item) => item.id === project?.clientId)
    const crumbs: Crumb[] = [{ label: "Simulações", to: "/" }]
    if (client) crumbs.push({ label: client.fullName })
    if (project) {
      crumbs.push(
        onProject ? { label: project.name } : { label: project.name, to: `/projetos/${project.id}` },
      )
    } else {
      crumbs.push({ label: onProject ? "Projeto" : "Simulação" })
    }
    if (onSimulation && project) crumbs.push({ label: "Simulação" })
    return crumbs
  }

  return [{ label: "Simulações" }]
}

export function ShellBreadcrumb() {
  const { pathname } = useLocation()
  const { projectId } = useParams()
  const studio = useStudio()
  const crumbs = buildCrumbs(pathname, projectId, studio)

  return (
    <nav aria-label="Trilha" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              {crumb.to && !current ? (
                <Link to={crumb.to} className="truncate text-muted-foreground hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span className={current ? "truncate font-medium text-foreground" : "truncate text-muted-foreground"}>
                  {crumb.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
