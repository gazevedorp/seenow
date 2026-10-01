import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { notify } from "@/lib/notify"
import { startDemoProject } from "@/lib/demo"
import { useStudio } from "@/lib/db"
import { formatWhen } from "@/lib/format"
import { useTitle } from "@/lib/use-title"

export function ProjectsPage() {
  const studio = useStudio()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  useTitle("Simulações")

  async function openDemo() {
    setPending(true)
    try {
      const projectId = await startDemoProject()
      navigate(`/simular/${projectId}`, { state: { start: "detect" } })
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Não foi possível abrir a demonstração.")
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Estúdio</p>
          <h1 className="mt-1 font-display text-5xl tracking-tight">Simulações</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Comece por um cliente e um ambiente. A foto e o histórico ficam neste navegador.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="h-10" asChild>
            <Link to="/simular/nova">Nova simulação</Link>
          </Button>
          <Button variant="outline" className="h-10" disabled={pending} onClick={() => void openDemo()}>
            {pending ? "Abrindo…" : "Abrir demonstração"}
          </Button>
        </div>
      </div>

      {pending ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2" role="status" aria-label="Abrindo a demonstração">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : null}
      {studio.projects.length === 0 && !pending ? (
        <EmptyState
          className="mt-10"
          title="Nenhuma simulação"
          description="Nenhuma simulação ainda. Abra um ambiente para mostrar o piso ou a parede com um produto do catálogo."
        />
      ) : studio.projects.length === 0 ? null : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {studio.projects.map((project) => {
            const client = studio.clients.find((item) => item.id === project.clientId)
            const versions = studio.generations.filter(
              (generation) => generation.projectId === project.id && generation.status === "SUCCEEDED",
            ).length
            return (
              <li key={project.id}>
                <Link
                  to={`/projetos/${project.id}`}
                  className="block rounded-2xl bg-card p-5 ring-1 ring-foreground/10 transition hover:ring-foreground/25"
                >
                  <p className="font-display text-3xl tracking-tight">{project.name}</p>
                  <p className="mt-1 text-sm">{client?.fullName ?? "Cliente removido"}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {versions === 0 ? "Nenhuma versão" : versions === 1 ? "1 versão" : `${versions} versões`}
                    {" · "}
                    {formatWhen(project.createdAt)}
                    {project.hasPhoto ? "" : " · sem foto"}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
