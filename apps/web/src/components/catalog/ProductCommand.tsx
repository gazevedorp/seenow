import { useMemo, useState } from "react"
import { surfaceLabel, type CatalogProduct, type Surface } from "@seenow/shared"
import { cn } from "cn"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ProductSwatch } from "@/components/catalog/ProductSwatch"
import { filterCatalog } from "@/lib/catalog"

export function ProductCommand({
  open,
  onOpenChange,
  surface,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  surface?: Surface | null
  onSelect: (product: CatalogProduct) => void
}) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const products = useMemo(
    () => filterCatalog({ query, surface: surface ?? undefined }),
    [query, surface],
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("")
          setActive(0)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buscar produto</DialogTitle>
          <DialogDescription>Escolha um SKU. Atalho ⌘K ou Ctrl+K.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          placeholder="Nome, marca ou SKU"
          aria-label="Buscar produto"
          aria-controls="product-command-list"
          aria-activedescendant={products[active] ? `product-command-${products[active].id}` : undefined}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setActive((index) => Math.min(products.length - 1, index + 1))
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              setActive((index) => Math.max(0, index - 1))
            } else if (event.key === "Enter" && products[active]) {
              event.preventDefault()
              onSelect(products[active])
              onOpenChange(false)
            }
          }}
        />
        <ScrollArea className="h-72">
          {products.length === 0 ? (
            <EmptyState title="Nenhum SKU" description="Nenhum produto combina com essa busca." className="py-10" />
          ) : (
            <ul id="product-command-list" role="listbox" aria-label="Produtos" className="grid gap-1 pr-3">
              {products.map((product, index) => (
                <li key={product.id}>
                  <button
                    id={`product-command-${product.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      onSelect(product)
                      onOpenChange(false)
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left",
                      index === active ? "bg-secondary" : "hover:bg-muted",
                    )}
                  >
                    <ProductSwatch product={product} className="size-10 rounded-md object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{product.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {product.sku} · {surfaceLabel(product.surface)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
