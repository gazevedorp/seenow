import { useEffect, useRef } from "react"

export function MaskOverlay({
  mask,
  width,
  height,
}: {
  mask: Uint8Array
  width: number
  height: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return
    const image = context.createImageData(width, height)
    for (let index = 0; index < mask.length; index++) {
      const alpha = mask[index] ?? 0
      if (alpha < 8) continue
      const offset = index * 4
      image.data[offset] = 71
      image.data[offset + 1] = 85
      image.data[offset + 2] = 105
      image.data[offset + 3] = Math.round(Math.min(255, alpha) * 0.45)
    }
    context.putImageData(image, 0, 0)
  }, [mask, width, height])

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
}
