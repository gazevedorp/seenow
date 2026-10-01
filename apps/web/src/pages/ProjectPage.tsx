import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { BeforeAfterSlider } from "@/components/compare/BeforeAfterSlider"
import { GenerationHistoryList } from "@/components/history/GenerationHistoryList"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { studioDb, useStudio } from "@/lib/db"
import { useGenerationPair, useGenerationThumbs } from "@/lib/use-generation-media"
import { useTitle } from "@/lib/use-title"

export function ProjectPage() {
  const { projectId = "" } = useParams()
  const studio = useStudio()
  const navigate = useNavigate()
  const project = studio.projects.find((item) => item.id === projectId)
  const client = studio.clients.find((item) => item.id === project?.clientId)
  const generations = useMemo(
    () =>
      studio.generations.filter(
        (item) => item.projectId === projectId && item.status === "SUCCEEDED",
      ),
    [studio.generations, projectId],
  )
  const [activeId, setActiveId] = useState<string | null>(generations[0]?.id ?? null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const thumbs = useGenerationThumbs(generations)
  const pair = useGenerationPair(activeId)
  useTitle(project?.name ?? "Projeto")

  if (!project) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <p>Esse projeto não está neste navegador.</p>
        <Button className="mt-4" asChild>
          <Link to="/">Voltar às simulações</Link>
        </Button>
      </main>
    )
  }

  async function remove() {
    setRemoving(true)
    try {
      await studioDb.removeProject(projectId)
      toast.success("Projeto removido deste navegador.")
      navigate("/")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover.")
      setRemoving(false)
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
      <div>
        <h1 className="font-display text-5xl tracking-tight">{project.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {client?.fullName ?? "Cliente"}
          {client?.phone ? ` · ${client.phone}` : ""}
          {client?.email ? ` · ${client.email}` : ""}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button className="h-10" asChild>
            <Link to={`/simular/${project.id}`} state={{ start: project.hasPhoto ? "surface" : "photo" }}>
              {project.hasPhoto ? "Nova versão" : "Enviar foto"}
            </Link>
          </Button>
          <Button variant="outline" className="h-10" onClick={() => setConfirmRemove(true)}>
            Remover
          </Button>
        </div>
        <div className="mt-6">
          {pair ? (
            <BeforeAfterSlider before={pair.before} after={pair.after} />
          ) : (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              {generations.length === 0
                ? "A comparação aparece aqui depois da primeira geração."
                : "Carregando a versão…"}
            </div>
          )}
        </div>
      </div>
      <aside>
        <h2 className="font-display text-2xl">Histórico</h2>
        <div className="mt-3">
          <GenerationHistoryList
            items={generations}
            thumbs={thumbs}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </div>
      </aside>
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover projeto</DialogTitle>
            <DialogDescription>
              A foto e as versões de {project.name} saem deste navegador.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={removing} onClick={() => void remove()}>
              {removing ? "Removendo…" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
