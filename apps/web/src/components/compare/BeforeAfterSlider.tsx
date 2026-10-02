import { useEffect, useRef, useState } from "react"

export function BeforeAfterSlider({ before, after }: { before: string; after: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(58)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  function moveTo(clientX: number) {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect || rect.width < 2) return
    const next = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(98, Math.max(2, next)))
  }

  const rounded = Math.round(position)

  return (
    <div
      ref={frame}
      role="slider"
      tabIndex={0}
      aria-label="Comparar antes e depois"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
      aria-valuetext={`${rounded}% antes`}
      className="relative isolate cursor-ew-resize overflow-hidden rounded-2xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        moveTo(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event.clientX)
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") setPosition((value) => Math.max(2, value - 3))
        if (event.key === "ArrowRight") setPosition((value) => Math.min(98, value + 3))
        if (event.key === "Home") setPosition(2)
        if (event.key === "End") setPosition(98)
      }}
    >
      <img src={after} alt="Depois da simulação" className="block w-full select-none" draggable={false} />
      <div className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img
          src={before}
          alt=""
          className="absolute inset-y-0 left-0 max-w-none select-none"
          style={{ width: width || undefined, height: "100%", objectFit: "cover" }}
          draggable={false}
        />
      </div>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${position}%` }}>
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background" />
        <div className="absolute top-1/2 flex h-9 min-w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background px-2 font-mono text-[11px] text-foreground shadow-sm">
          {rounded}
        </div>
      </div>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-background/95 px-2 py-0.5 text-xs text-foreground">
        Antes
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-background/95 px-2 py-0.5 text-xs text-foreground">
        Depois
      </span>
    </div>
  )
}
