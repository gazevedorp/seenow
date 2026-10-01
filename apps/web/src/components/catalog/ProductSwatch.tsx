import { useState } from "react"
import type { CatalogProduct } from "@seenow/shared"
import { cn } from "cn"
import { Skeleton } from "@/components/ui/skeleton"

export function ProductSwatch({
  product,
  className,
}: {
  product: CatalogProduct
  className?: string
}) {
  const [ready, setReady] = useState(false)
  const frame = className ?? "aspect-[16/10] w-full object-cover"

  return (
    <span className="relative block bg-muted">
      {ready ? null : <Skeleton className={cn("absolute inset-0", frame)} />}
      <img
        src={product.textureUrl}
        alt=""
        onLoad={() => setReady(true)}
        className={cn(frame, ready ? "opacity-100" : "opacity-0")}
      />
    </span>
  )
}
