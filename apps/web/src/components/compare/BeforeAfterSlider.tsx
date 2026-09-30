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
    if (!rect) return
    const next = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(98, Math.max(2, next)))
  }

  return (
    <div
      ref={frame}
      role="slider"
      tabIndex={0}
      aria-label="Comparar antes e depois"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
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
        <div className="absolute inset-y-0 -translate-x-1/2 bg-white" style={{ width: 2 }} />
        <div className="absolute top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/10 bg-white shadow-sm" />
      </div>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-background/90 px-2 py-0.5 text-xs">
        Antes
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-background/90 px-2 py-0.5 text-xs">
        Depois
      </span>
    </div>
  )
}
