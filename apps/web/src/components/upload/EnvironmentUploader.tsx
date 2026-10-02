import { useId } from "react"
import { Button } from "@/components/ui/button"
import { Dropzone } from "@/components/upload/Dropzone"

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

  return (
    <div className="space-y-3">
      <Dropzone previewUrl={previewUrl} onFile={onFile} inputId={inputId} />
      {dimensions ? <p className="font-mono text-xs text-muted-foreground">{dimensions}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={onSample}>
          Usar foto de exemplo
        </Button>
        {previewUrl ? (
          <Button type="button" variant="ghost" className="h-10" asChild>
            <label htmlFor={inputId} className="cursor-pointer">
              Trocar foto
            </label>
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        A foto fica neste navegador. Nenhum dado do cliente é enviado a um provedor de IA nesta fase.
      </p>
    </div>
  )
}
