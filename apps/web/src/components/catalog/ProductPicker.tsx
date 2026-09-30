import { useMemo, useState } from "react"
import {
  CATEGORY_LABEL,
  PRODUCT_CATEGORIES,
  surfaceLabel,
  type CatalogProduct,
  type ProductCategory,
  type Surface,
} from "@seenow/shared"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { ProductSwatch } from "@/components/catalog/ProductSwatch"
import { categoryLabel, filterCatalog } from "@/lib/catalog"

const FILTERS: Array<ProductCategory | "ALL"> = ["ALL", ...PRODUCT_CATEGORIES]

export function ProductPicker({
  surface,
  selectedId,
  onSelect,
}: {
  surface?: Surface | null
  selectedId: string | null
  onSelect: (product: CatalogProduct) => void
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<ProductCategory | "ALL">("ALL")
  const products = useMemo(
    () => filterCatalog({ query, category, surface: surface ?? undefined }),
    [query, category, surface],
  )

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar nome ou SKU"
        aria-label="Buscar produto"
        className="h-10"
      />
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs",
              category === item ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
            )}
          >
            {item === "ALL" ? "Todas" : CATEGORY_LABEL[item]}
          </button>
        ))}
      </div>
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum produto com esse filtro.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {products.map((product) => {
            const selected = product.id === selectedId
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect(product)}
                aria-pressed={selected}
                className={cn(
                  "overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10",
                  selected && "ring-2 ring-pine",
                )}
              >
                <ProductSwatch product={product} />
                <div className="space-y-0.5 p-2.5">
                  <p className="text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.brand} · {product.sku}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {surfaceLabel(product.surface)} · {categoryLabel(product.category)}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
