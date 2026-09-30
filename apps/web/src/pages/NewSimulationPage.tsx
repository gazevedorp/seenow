import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { ClientRecord, ProjectRecord } from "@seenow/shared"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ClientQuickCreateForm,
  type ClientDraft,
} from "@/components/clients/ClientQuickCreateForm"
import { keys, putBlob, studioDb, useStudio } from "@/lib/db"
import { renderSampleRoom } from "@/lib/sample-room"
import { useTitle } from "@/lib/use-title"
import { cn } from "cn"

function optionalEmailError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "E-mail inválido."
  return null
}

export function NewSimulationPage() {
  const studio = useStudio()
  const navigate = useNavigate()
  const [mode, setMode] = useState<"existing" | "new">(studio.clients.length > 0 ? "existing" : "new")
  const [selectedId, setSelectedId] = useState(studio.clients[0]?.id ?? "")
  const [draft, setDraft] = useState<ClientDraft>({
    fullName: "",
    email: "",
    document: "",
    phone: "",
  })
  const [projectName, setProjectName] = useState("")
  const [useSample, setUseSample] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<"fullName" | "email" | "projectName", string>>>({})
  const [pending, setPending] = useState(false)
  useTitle("Nova simulação")

  async function create() {
    const nextErrors: typeof errors = {}
    if (mode === "new" && draft.fullName.trim().length < 2) {
      nextErrors.fullName = "Nome completo é obrigatório."
    }
    const emailError = mode === "new" ? optionalEmailError(draft.email) : null
    if (emailError) nextErrors.email = emailError
    if (projectName.trim().length < 2) nextErrors.projectName = "Dê um nome ao ambiente."
    if (mode === "existing" && !selectedId) nextErrors.fullName = "Escolha um cliente."
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    try {
      let clientId = selectedId
      if (mode === "new") {
        const client: ClientRecord = {
          id: crypto.randomUUID(),
          fullName: draft.fullName.trim(),
          createdAt: new Date().toISOString(),
          ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
          ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
          ...(draft.document.trim() ? { document: draft.document.trim() } : {}),
        }
        await studioDb.addClient(client)
        clientId = client.id
      }
      const project: ProjectRecord = {
        id: crypto.randomUUID(),
        clientId,
        name: projectName.trim(),
        createdAt: new Date().toISOString(),
        hasPhoto: false,
      }
      if (useSample) {
        await putBlob(keys.photo(project.id), await renderSampleRoom())
        project.hasPhoto = true
      }
      await studioDb.addProject(project)
      navigate(`/simular/${project.id}`, { state: { start: useSample ? "detect" : "photo" } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a simulação.")
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        Voltar às simulações
      </Link>
      <h1 className="mt-3 font-display text-5xl tracking-tight">Nova simulação</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O cliente fica vinculado ao ambiente. Nome é o único campo obrigatório.
      </p>

      <section className="mt-8 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "outline"}
            className="h-9"
            disabled={studio.clients.length === 0}
            onClick={() => setMode("existing")}
          >
            Cliente já cadastrado
          </Button>
          <Button
            type="button"
            variant={mode === "new" ? "default" : "outline"}
            className="h-9"
            onClick={() => setMode("new")}
          >
            Novo cliente
          </Button>
        </div>

        {mode === "existing" ? (
          <div className="grid gap-2">
            {studio.clients.map((client) => (
              <button
                key={client.id}
                type="button"
                aria-pressed={selectedId === client.id}
                onClick={() => setSelectedId(client.id)}
                className={cn(
                  "rounded-xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10",
                  selectedId === client.id && "ring-2 ring-pine",
                )}
              >
                <span className="block text-sm font-medium">{client.fullName}</span>
                <span className="block text-xs text-muted-foreground">
                  {[client.email, client.phone].filter(Boolean).join(" · ") || "Sem contato"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <ClientQuickCreateForm draft={draft} onChange={setDraft} errors={errors} />
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="room-name">Ambiente</Label>
          <Input
            id="room-name"
            className="h-10"
            value={projectName}
            placeholder="Sala de estar, quarto, varanda…"
            onChange={(event) => setProjectName(event.target.value)}
            aria-invalid={Boolean(errors.projectName)}
          />
          {errors.projectName ? <p className="text-xs text-destructive">{errors.projectName}</p> : null}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useSample}
            onChange={(event) => setUseSample(event.target.checked)}
          />
          Começar com a foto de exemplo
        </label>

        <Button type="button" className="h-11" disabled={pending} onClick={() => void create()}>
          {pending ? "Criando…" : "Abrir estúdio"}
        </Button>
      </section>
    </main>
  )
}
