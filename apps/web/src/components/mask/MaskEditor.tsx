import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import type { Surface } from "@seenow/shared"
import { Button } from "@/components/ui/button"
import { stampLine } from "@/lib/mask"

function paintOverlay(canvas: HTMLCanvasElement, mask: Uint8Array, width: number, height: number) {
  const context = canvas.getContext("2d")
  if (!context) return
  const image = context.createImageData(width, height)
  for (let index = 0; index < mask.length; index++) {
    const alpha = mask[index] ?? 0
    if (alpha === 0) continue
    const offset = index * 4
    image.data[offset] = 166
    image.data[offset + 1] = 78
    image.data[offset + 2] = 42
    image.data[offset + 3] = Math.round(alpha * 0.45)
  }
  context.putImageData(image, 0, 0)
}

export function MaskEditor({
  source,
  width,
  height,
  surface,
  mask,
  onChange,
  onResegment,
  segmenting = false,
  hint,
}: {
  source: HTMLCanvasElement
  width: number
  height: number
  surface: Surface
  mask: Uint8Array
  onChange: (next: Uint8Array) => void
  onResegment?: () => void
  segmenting?: boolean
  hint?: string
}) {
  const viewRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef(mask)
  const undoRef = useRef<Uint8Array[]>([])
  const toolRef = useRef<"add" | "erase">("add")
  const radiusRef = useRef(28)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [tool, setTool] = useState<"add" | "erase">("add")
  const [radius, setRadius] = useState(28)
  const [canUndo, setCanUndo] = useState(false)

  useEffect(() => {
    toolRef.current = tool
  }, [tool])

  useEffect(() => {
    radiusRef.current = radius
  }, [radius])

  useEffect(() => {
    maskRef.current = mask
    const overlay = overlayRef.current
    if (!overlay || overlay.width !== width) return
    paintOverlay(overlay, mask, width, height)
  }, [mask, width, height])

  useEffect(() => {
    const view = viewRef.current
    const overlay = overlayRef.current
    if (!view || !overlay) return
    view.width = width
    view.height = height
    overlay.width = width
    overlay.height = height
    const context = view.getContext("2d")
    if (!context) return
    context.drawImage(source, 0, 0)
    paintOverlay(overlay, maskRef.current, width, height)
  }, [source, width, height])

  function remember() {
    undoRef.current.push(maskRef.current.slice())
    if (undoRef.current.length > 12) undoRef.current.shift()
    setCanUndo(true)
  }

  function publish(next: Uint8Array) {
    maskRef.current = next
    const overlay = overlayRef.current
    if (overlay) paintOverlay(overlay, next, width, height)
    onChange(next.slice())
  }

  function locate(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
      scale: width / rect.width,
    }
  }

  function drawStroke(from: { x: number; y: number }, to: { x: number; y: number }, imageRadius: number) {
    stampLine(maskRef.current, width, height, from.x, from.y, to.x, to.y, imageRadius, toolRef.current)
    const overlay = overlayRef.current
    const context = overlay?.getContext("2d")
    if (!context) return
    context.save()
    context.lineCap = "round"
    context.lineJoin = "round"
    context.lineWidth = imageRadius * 2
    context.strokeStyle = "rgba(166, 78, 42, 0.45)"
    context.globalCompositeOperation = toolRef.current === "add" ? "source-over" : "destination-out"
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    context.stroke()
    context.restore()
  }

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-2xl bg-muted"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <canvas ref={viewRef} className="absolute inset-0 h-full w-full" />
        <canvas
          ref={overlayRef}
          aria-label="Editor de máscara"
          className="absolute inset-0 h-full w-full touch-none"
          style={{ cursor: tool === "add" ? "crosshair" : "cell" }}
          onPointerDown={(event) => {
            const point = locate(event)
            if (!point) return
            event.currentTarget.setPointerCapture(event.pointerId)
            remember()
            drawing.current = true
            last.current = point
            drawStroke(point, point, radiusRef.current * point.scale)
          }}
          onPointerMove={(event) => {
            if (!drawing.current || !last.current) return
            const point = locate(event)
            if (!point) return
            drawStroke(last.current, point, radiusRef.current * point.scale)
            last.current = point
          }}
          onPointerUp={() => {
            if (!drawing.current) return
            drawing.current = false
            last.current = null
            publish(maskRef.current)
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={segmenting || !onResegment} onClick={() => onResegment?.()}>
          {segmenting ? "Identificando…" : "Identificar de novo"}
        </Button>
      </div>
      <details className="rounded-xl bg-secondary/60 px-3 py-2">
        <summary className="cursor-pointer text-sm">Ajuste fino (opcional)</summary>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={tool === "add" ? "default" : "outline"}
            aria-pressed={tool === "add"}
            onClick={() => setTool("add")}
          >
            Pincel
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "erase" ? "default" : "outline"}
            aria-pressed={tool === "erase"}
            onClick={() => setTool("erase")}
          >
            Borracha
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Tamanho
            <input
              type="range"
              min={12}
              max={72}
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
              aria-label="Tamanho do pincel"
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canUndo}
            onClick={() => {
              const previous = undoRef.current.pop()
              setCanUndo(undoRef.current.length > 0)
              if (!previous) return
              publish(previous)
            }}
          >
            Desfazer
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              remember()
              publish(new Uint8Array(width * height))
            }}
          >
            Limpar
          </Button>
        </div>
      </details>
      <p className="text-xs text-muted-foreground">
        {hint ??
          (surface === "FLOOR"
            ? "A região do piso já vem marcada. O pincel só corrige o que sobrou."
            : "A região da parede já vem marcada. O pincel só corrige o que sobrou.")}
      </p>
    </div>
  )
}
