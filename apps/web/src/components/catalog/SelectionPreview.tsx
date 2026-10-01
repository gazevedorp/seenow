import type { CatalogProduct } from "@seenow/shared"

export function SelectionPreview({ product }: { product: CatalogProduct }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[min(100%-1.5rem,18rem)] items-center gap-3 rounded-xl bg-background/95 p-2 ring-1 ring-border">
      <img src={product.textureUrl} alt="" className="size-14 rounded-lg object-cover" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{product.name}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">{product.sku}</span>
      </span>
    </div>
  )
}
