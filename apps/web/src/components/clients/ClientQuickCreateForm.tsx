import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type ClientDraft = {
  fullName: string
  email: string
  document: string
  phone: string
}

export function ClientQuickCreateForm({
  draft,
  onChange,
  errors,
}: {
  draft: ClientDraft
  onChange: (draft: ClientDraft) => void
  errors: Partial<Record<keyof ClientDraft, string>>
}) {
  function set<K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) {
    onChange({ ...draft, [key]: value })
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="client-name">Nome completo</Label>
        <Input
          id="client-name"
          className="h-10"
          value={draft.fullName}
          placeholder="Nome de quem vai ver a simulação"
          onChange={(event) => set("fullName", event.target.value)}
          aria-invalid={Boolean(errors.fullName)}
        />
        {errors.fullName ? <p className="text-xs text-destructive">{errors.fullName}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="client-email">E-mail</Label>
          <Input
            id="client-email"
            type="email"
            className="h-10"
            value={draft.email}
            placeholder="opcional"
            onChange={(event) => set("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="client-phone">Telefone</Label>
          <Input
            id="client-phone"
            className="h-10"
            value={draft.phone}
            placeholder="(11) 90000-0000"
            onChange={(event) => set("phone", event.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="client-document">Documento</Label>
        <Input
          id="client-document"
          className="h-10"
          value={draft.document}
          placeholder="CPF ou CNPJ, se quiser"
          onChange={(event) => set("document", event.target.value)}
        />
      </div>
    </div>
  )
}
