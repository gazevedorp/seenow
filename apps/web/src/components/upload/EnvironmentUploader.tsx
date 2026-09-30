import { useId, useState } from "react"
import { MAX_LONG_EDGE_PX } from "@seenow/shared"
import { Button } from "@/components/ui/button"
import { validateEnvironmentFile } from "@/lib/images"

export function EnvironmentUploader({
  previewUrl,
  dimensions,
  onFile,
  onSample,
}: {
  previewUrl: string | null
  dimensions: string | null
  onFile: (file: File) => void
  onSample: () => void
}) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function take(file: File | undefined) {
    if (!file) return
    const problem = validateEnvironmentFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    onFile(file)
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          take(event.dataTransfer.files[0])
        }}
        className={`grid min-h-72 cursor-pointer place-items-center rounded-2xl border border-dashed bg-card px-6 py-8 text-center ${
          dragging ? "border-pine bg-secondary" : "border-input"
        }`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Foto do ambiente" className="max-h-[28rem] w-full rounded-xl object-contain" />
        ) : (
          <span className="max-w-sm">
            <span className="block font-display text-3xl">Solte a foto do ambiente</span>
            <span className="mt-2 block text-sm text-muted-foreground">
              JPEG, PNG ou WEBP, até 10 MB. O lado maior fica em {MAX_LONG_EDGE_PX} px.
            </span>
          </span>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            take(event.target.files?.[0])
            event.target.value = ""
          }}
        />
      </label>
      {dimensions ? <p className="text-sm text-muted-foreground">{dimensions}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={onSample}>
          Usar foto de exemplo
        </Button>
        {previewUrl ? (
          <Button type="button" variant="ghost" className="h-10" asChild>
            <label htmlFor={inputId}>Trocar foto</label>
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        A foto fica neste navegador. Nenhum dado do cliente é enviado a um provedor de IA nesta fase.
      </p>
    </div>
  )
}
