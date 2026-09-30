import { useMemo, useState } from "react"
import { CATEGORY_LABEL, PRODUCT_CATEGORIES, surfaceLabel, type ProductCategory } from "@seenow/shared"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { ProductSwatch } from "@/components/catalog/ProductSwatch"
import { categoryLabel, filterCatalog } from "@/lib/catalog"
import { useTitle } from "@/lib/use-title"

const FILTERS: Array<ProductCategory | "ALL"> = ["ALL", ...PRODUCT_CATEGORIES]

export function CatalogPage() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<ProductCategory | "ALL">("ALL")
  const products = useMemo(() => filterCatalog({ query, category }), [query, category])
  useTitle("Catálogo")

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Demonstração</p>
      <h1 className="mt-1 font-display text-5xl tracking-tight">Catálogo</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Pisos e revestimentos com textura contínua. A prévia usa o arquivo do SKU, não uma cor inventada.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar nome, marca ou SKU"
          aria-label="Buscar no catálogo"
          className="h-10 sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                category === item ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}
            >
              {item === "ALL" ? "Todas" : CATEGORY_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
      {products.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nenhum produto com esse filtro.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <li key={product.id} className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
              <ProductSwatch product={product} />
              <div className="space-y-1 p-3">
                <p className="font-medium">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {product.brand} · {product.sku}
                </p>
                <p className="text-xs text-muted-foreground">
                  {surfaceLabel(product.surface)} · {categoryLabel(product.category)}
                  {product.finish ? ` · ${product.finish}` : ""}
                  {product.dimensions ? ` · ${product.dimensions}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
