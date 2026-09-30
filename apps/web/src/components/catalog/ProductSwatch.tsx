import { useEffect, useRef } from "react"
import type { CatalogProduct, Surface } from "@seenow/shared"
import { drawTexture } from "@/lib/textures"

export function ProductSwatch({
  product,
  surface,
  className,
}: {
  product: CatalogProduct
  surface: Surface
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    drawTexture(context, product, surface, canvas.width, canvas.height)
  }, [product, surface])

  return (
    <canvas
      ref={ref}
      width={320}
      height={200}
      aria-hidden
      className={className ?? "aspect-[16/10] w-full"}
    />
  )
}
