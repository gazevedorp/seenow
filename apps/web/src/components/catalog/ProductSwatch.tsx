import type { CatalogProduct } from "@seenow/shared"

export function ProductSwatch({
  product,
  className,
}: {
  product: CatalogProduct
  className?: string
}) {
  return (
    <img
      src={product.textureUrl}
      alt=""
      className={className ?? "aspect-[16/10] w-full bg-muted object-cover"}
    />
  )
}
