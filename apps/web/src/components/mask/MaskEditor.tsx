import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import type { Surface } from "@seenow/shared"
import { MaskToolbar } from "@/components/mask/MaskToolbar"
import { stampLine } from "@/lib/mask"

function paintOverlay(canvas: HTMLCanvasElement, mask: Uint8Array, width: number, height: number) {
  const context = canvas.getContext("2d")
  if (!context) return
  const image = context.createImageData(width, height)
  for (let index = 0; index < mask.length; index++) {
    const alpha = mask[index] ?? 0
    if (alpha === 0) continue
    const offset = index * 4
    image.data[offset] = 71
    image.data[offset + 1] = 85
    image.data[offset + 2] = 105
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
  showOverlay = true,
  hint,
  onChange,
  onRedetect,
  redetectLabel = "Detectar de novo",
  onToggleOverlay,
}: {
  source: HTMLCanvasElement
  width: number
  height: number
  surface: Surface
  mask: Uint8Array
  showOverlay?: boolean
  hint: string
  onChange: (next: Uint8Array) => void
  onRedetect?: () => void
  redetectLabel?: string
  onToggleOverlay: () => void
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

  function undo() {
    const previous = undoRef.current.pop()
    setCanUndo(undoRef.current.length > 0)
    if (!previous) return
    publish(previous)
  }

  function clearMask() {
    remember()
    publish(new Uint8Array(width * height))
  }

  const actions = useRef({ undo, clearMask, onToggleOverlay, onRedetect })

  useEffect(() => {
    actions.current = { undo, clearMask, onToggleOverlay, onRedetect }
  })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        actions.current.undo()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === "b") setTool("add")
      else if (key === "e") setTool("erase")
      else if (key === "[") setRadius((value) => Math.max(12, value - 4))
      else if (key === "]") setRadius((value) => Math.min(72, value + 4))
      else if (key === "d") actions.current.onToggleOverlay()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
    context.strokeStyle = "rgba(71, 85, 105, 0.7)"
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
          aria-label={surface === "FLOOR" ? "Editor da máscara do piso" : "Editor da máscara da parede"}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ cursor: tool === "add" ? "crosshair" : "cell", opacity: showOverlay ? 1 : 0 }}
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
      <MaskToolbar
        tool={tool}
        onTool={setTool}
        radius={radius}
        onRadius={setRadius}
        canUndo={canUndo}
        onUndo={undo}
        onRedetect={onRedetect}
        redetectLabel={redetectLabel}
        onClear={clearMask}
        showOverlay={showOverlay}
        onToggleOverlay={onToggleOverlay}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
