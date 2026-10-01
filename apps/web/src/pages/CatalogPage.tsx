import { useMemo, useState } from "react"
import { CATEGORY_LABEL, PRODUCT_CATEGORIES, surfaceLabel, type CatalogProduct, type ProductCategory, type Surface } from "@seenow/shared"
import { cn } from "cn"
import { ProductCommand } from "@/components/catalog/ProductCommand"
import { SelectionPreview } from "@/components/catalog/SelectionPreview"
import { ProductSwatch } from "@/components/catalog/ProductSwatch"
import { useProductCommand } from "@/components/catalog/use-product-command"
import { EmptyState } from "@/components/feedback/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { categoryLabel, filterCatalog, findProduct } from "@/lib/catalog"
import { useTitle } from "@/lib/use-title"

const FILTERS: Array<ProductCategory | "ALL"> = ["ALL", ...PRODUCT_CATEGORIES]

export function CatalogPage() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<ProductCategory | "ALL">("ALL")
  const [surface, setSurface] = useState<Surface>("FLOOR")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const command = useProductCommand()
  const products = useMemo(() => filterCatalog({ query, category, surface }), [query, category, surface])
  const selected = selectedId ? findProduct(selectedId) : undefined
  useTitle("Catálogo")

  function choose(product: CatalogProduct) {
    setSelectedId(product.id)
    setSurface(product.surface)
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Demonstração</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-5xl tracking-tight">Catálogo</h1>
        <Button type="button" variant="outline" className="h-10" onClick={() => command.setOpen(true)}>
          Buscar produto · ⌘K
        </Button>
      </div>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Pisos e revestimentos com textura contínua. A prévia usa o arquivo do SKU, não uma cor inventada.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={surface} onValueChange={(value) => setSurface(value as Surface)}>
          <TabsList aria-label="Superfície do catálogo">
            <TabsTrigger value="FLOOR">Piso</TabsTrigger>
            <TabsTrigger value="WALL">Parede</TabsTrigger>
          </TabsList>
        </Tabs>
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
      <div className="relative mt-6 min-h-48 overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10">
        {selected ? (
          <>
            <img src={selected.textureUrl} alt="" className="max-h-72 w-full object-cover" />
            <SelectionPreview product={selected} />
          </>
        ) : (
          <p className="grid min-h-48 place-items-center px-6 text-sm text-muted-foreground">
            Escolha um SKU para ver a textura neste quadro.
          </p>
        )}
      </div>
      {products.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Nenhum produto"
          description="Nenhum SKU combina com essa superfície e esse filtro."
        />
      ) : (
        <ScrollArea className="mt-6 h-[min(36rem,70svh)]">
          <ul className="grid gap-3 pr-3 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => choose(product)}
                  aria-pressed={product.id === selectedId}
                  className={cn(
                    "w-full overflow-hidden rounded-2xl bg-card text-left ring-1 ring-foreground/10",
                    product.id === selectedId && "ring-2 ring-pine",
                  )}
                >
                  <ProductSwatch product={product} />
                  <div className="space-y-1 p-3">
                    <p className="font-medium">{product.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {product.brand} · {product.sku}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {surfaceLabel(product.surface)} · {categoryLabel(product.category)}
                      {product.finish ? ` · ${product.finish}` : ""}
                      {product.dimensions ? ` · ${product.dimensions}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
      <ProductCommand open={command.open} onOpenChange={command.setOpen} surface={surface} onSelect={choose} />
    </main>
  )
}
