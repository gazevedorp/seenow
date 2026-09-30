import {
  CATEGORY_LABEL,
  type CatalogProduct,
  type ProductCategory,
  type Surface,
} from "@seenow/shared"

export const CATALOG: CatalogProduct[] = [
  {
    id: "carvalho-mel",
    sku: "LAM-CARV-19",
    name: "Carvalho Mel",
    brand: "Lâmina",
    category: "PISOS",
    finish: "Acetinado",
    dimensions: "19 × 120 cm",
    texture: "wood",
    hex: "#C4A06A",
    accentHex: "#8A5A32",
  },
  {
    id: "nogueira-noturna",
    sku: "LAM-NOG-20",
    name: "Nogueira Noturna",
    brand: "Lâmina",
    category: "PISOS",
    finish: "Fosco",
    dimensions: "20 × 120 cm",
    texture: "wood",
    hex: "#6B4332",
    accentHex: "#3E261C",
  },
  {
    id: "calacatta-oro",
    sku: "NOR-CAL-90",
    name: "Calacatta Oro",
    brand: "Norte",
    category: "PORCELANATOS",
    finish: "Polido",
    dimensions: "90 × 90 cm",
    texture: "marble",
    hex: "#F3EFE6",
    accentHex: "#C4B48A",
  },
  {
    id: "cimento-sao-paulo",
    sku: "NOR-CIM-80",
    name: "Cimento São Paulo",
    brand: "Norte",
    category: "PORCELANATOS",
    finish: "Acetinado",
    dimensions: "80 × 80 cm",
    texture: "concrete",
    hex: "#B7B2AA",
    accentHex: "#7E7A74",
  },
  {
    id: "travertino-romano",
    sku: "OFI-TRAV-20",
    name: "Travertino Romano",
    brand: "Oficina",
    category: "REVESTIMENTOS",
    finish: "Natural",
    dimensions: "20 × 60 cm",
    texture: "stone",
    hex: "#E4D2B8",
    accentHex: "#B89B74",
  },
  {
    id: "areia-quente",
    sku: "PIG-AREIA",
    name: "Areia Quente",
    brand: "Pigmento",
    category: "TINTAS",
    finish: "Fosco",
    hex: "#E6C79A",
    accentHex: "#C9A36E",
    texture: "paint",
  },
  {
    id: "salvia",
    sku: "PIG-SALVIA",
    name: "Sálvia",
    brand: "Pigmento",
    category: "TINTAS",
    finish: "Acetinado",
    hex: "#7F967C",
    accentHex: "#5E7360",
    texture: "paint",
  },
  {
    id: "azul-sereno",
    sku: "PIG-AZUL",
    name: "Azul Sereno",
    brand: "Pigmento",
    category: "TINTAS",
    finish: "Fosco",
    hex: "#7E9AAD",
    accentHex: "#5D7A8C",
    texture: "paint",
  },
]

export function categoryLabel(category: ProductCategory): string {
  return CATEGORY_LABEL[category]
}

export function matchesSurface(product: CatalogProduct, surface: Surface): boolean {
  if (surface === "FLOOR") return product.category !== "TINTAS"
  return product.category === "TINTAS" || product.category === "REVESTIMENTOS"
}

export function swatchSurface(product: CatalogProduct): Surface {
  if (product.category === "TINTAS" || product.category === "REVESTIMENTOS") return "WALL"
  return "FLOOR"
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

export function filterCatalog(options: {
  query?: string
  category?: ProductCategory | "ALL"
  surface?: Surface
}): CatalogProduct[] {
  const query = fold(options.query?.trim() ?? "")
  return CATALOG.filter((product) => {
    if (options.surface && !matchesSurface(product, options.surface)) return false
    if (options.category && options.category !== "ALL" && product.category !== options.category) {
      return false
    }
    if (!query) return true
    const haystack = fold(`${product.name} ${product.sku} ${product.brand} ${product.category}`)
    return haystack.includes(query)
  })
}

export function findProduct(id: string): CatalogProduct | undefined {
  return CATALOG.find((product) => product.id === id)
}
