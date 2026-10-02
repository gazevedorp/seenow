import {
  CATEGORY_LABEL,
  type CatalogProduct,
  type ProductCategory,
  type Surface,
} from "./domain.ts"

export const CATALOG: CatalogProduct[] = [
  {
    id: "laminate-oak-light",
    sku: "LAM-OAK-CLARO",
    name: "Laminado carvalho claro",
    brand: "Lâmina",
    category: "PISOS",
    finish: "Acetinado",
    dimensions: "19 × 120 cm",
    texture: "wood",
    hex: "#C4A574",
    accentHex: "#8C6239",
    surface: "FLOOR",
    textureUrl: "/textures/laminate-oak-light.png",
    tileScale: 3.2,
    textureAxis: "depth",
  },
  {
    id: "laminate-oak-dark",
    sku: "LAM-OAK-ESCURO",
    name: "Laminado carvalho escuro",
    brand: "Lâmina",
    category: "PISOS",
    finish: "Fosco",
    dimensions: "19 × 120 cm",
    texture: "wood",
    hex: "#6B4632",
    accentHex: "#3A2418",
    surface: "FLOOR",
    textureUrl: "/textures/laminate-oak-dark.png",
    tileScale: 3.2,
    textureAxis: "depth",
  },
  {
    id: "vinyl-wood",
    sku: "VIN-MAD-NOZ",
    name: "Vinílico amadeirado",
    brand: "Vértice",
    category: "VINILICOS",
    finish: "Acetinado",
    dimensions: "18 × 122 cm",
    texture: "wood",
    hex: "#A97848",
    accentHex: "#6A4324",
    surface: "FLOOR",
    textureUrl: "/textures/vinyl-wood.png",
    tileScale: 3.4,
    textureAxis: "depth",
  },
  {
    id: "vinyl-stone",
    sku: "VIN-PEDRA-CINZA",
    name: "Vinílico pedra",
    brand: "Vértice",
    category: "VINILICOS",
    finish: "Fosco",
    dimensions: "30 × 60 cm",
    texture: "stone",
    hex: "#C2B8A8",
    accentHex: "#8A8074",
    surface: "FLOOR",
    textureUrl: "/textures/vinyl-stone.png",
    tileScale: 3.6,
    textureAxis: "grid",
  },
  {
    id: "porcelain-gray-matte",
    sku: "POR-CINZA-90",
    name: "Porcelanato cinza mate",
    brand: "Norte",
    category: "PORCELANATOS",
    finish: "Mate",
    dimensions: "90 × 90 cm",
    texture: "concrete",
    hex: "#B7B4AE",
    accentHex: "#7E7B76",
    surface: "FLOOR",
    textureUrl: "/textures/porcelain-gray-matte.png",
    tileScale: 2.4,
    textureAxis: "grid",
  },
  {
    id: "porcelain-marble",
    sku: "POR-MARMORE-90",
    name: "Porcelanato mármore",
    brand: "Norte",
    category: "PORCELANATOS",
    finish: "Polido",
    dimensions: "90 × 90 cm",
    texture: "marble",
    hex: "#F3EFE6",
    accentHex: "#C4B48A",
    surface: "FLOOR",
    textureUrl: "/textures/porcelain-marble.png",
    tileScale: 2.2,
    textureAxis: "grid",
  },
  {
    id: "carpet-gray",
    sku: "CAR-CINZA-40",
    name: "Carpete cinza",
    brand: "Trama",
    category: "CARPETES",
    finish: "Texturizado",
    dimensions: "50 × 50 cm",
    texture: "concrete",
    hex: "#8E8B86",
    accentHex: "#5E5B57",
    surface: "FLOOR",
    textureUrl: "/textures/carpet-gray.png",
    tileScale: 2.1,
    textureAxis: "grid",
  },
  {
    id: "ceramic-hex",
    sku: "CER-HEX-BRANCO",
    name: "Cerâmica hexagonal",
    brand: "Oficina",
    category: "REVESTIMENTOS",
    finish: "Brilhante",
    dimensions: "hex 15 cm",
    texture: "stone",
    hex: "#F4F1EA",
    accentHex: "#D5D0C6",
    surface: "WALL",
    textureUrl: "/textures/ceramic-hex.png",
    tileScale: 4.8,
    textureAxis: "grid",
  },
  {
    id: "ceramic-subway",
    sku: "CER-SUBWAY-BRANCO",
    name: "Cerâmica subway",
    brand: "Oficina",
    category: "REVESTIMENTOS",
    finish: "Brilhante",
    dimensions: "7,5 × 15 cm",
    texture: "stone",
    hex: "#F7F5F0",
    accentHex: "#C9C4BA",
    surface: "WALL",
    textureUrl: "/textures/ceramic-subway.png",
    tileScale: 5.5,
    textureAxis: "grid",
  },
]

export function categoryLabel(category: ProductCategory): string {
  return CATEGORY_LABEL[category]
}

export function matchesSurface(product: CatalogProduct, surface: Surface): boolean {
  return product.surface === surface
}

export function swatchSurface(product: CatalogProduct): Surface {
  return product.surface
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
