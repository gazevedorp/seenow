import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

export function MaskToolbar({
  tool,
  onTool,
  radius,
  onRadius,
  canUndo,
  onUndo,
  onRedetect,
  redetectLabel = "Detectar de novo",
  onClear,
  showOverlay,
  onToggleOverlay,
}: {
  tool: "add" | "erase"
  onTool: (tool: "add" | "erase") => void
  radius: number
  onRadius: (radius: number) => void
  canUndo: boolean
  onUndo: () => void
  onRedetect?: () => void
  redetectLabel?: string
  onClear: () => void
  showOverlay: boolean
  onToggleOverlay: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={tool === "add" ? "default" : "outline"}
        aria-pressed={tool === "add"}
        aria-keyshortcuts="B"
        onClick={() => onTool("add")}
      >
        Pincel
      </Button>
      <Button
        type="button"
        size="sm"
        variant={tool === "erase" ? "default" : "outline"}
        aria-pressed={tool === "erase"}
        aria-keyshortcuts="E"
        onClick={() => onTool("erase")}
      >
        Borracha
      </Button>
      <label className="flex min-w-40 items-center gap-2 text-xs text-muted-foreground">
        Tamanho
        <Slider min={12} max={72} value={radius} onValueChange={onRadius} aria-label="Tamanho do pincel" />
      </label>
      <Button type="button" size="sm" variant="outline" disabled={!canUndo} aria-keyshortcuts="Control+Z Meta+Z" onClick={onUndo}>
        Desfazer
      </Button>
      {onRedetect ? (
        <Button type="button" size="sm" variant="outline" onClick={onRedetect}>
          {redetectLabel}
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="ghost" onClick={onClear}>
        Limpar
      </Button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showOverlay} onChange={onToggleOverlay} />
        Máscara de depuração
      </label>
      <p className="basis-full text-xs text-muted-foreground">B pincel · E borracha · [ ] tamanho · ⌘Z ou Ctrl+Z desfazer · D máscara</p>
    </div>
  )
}
