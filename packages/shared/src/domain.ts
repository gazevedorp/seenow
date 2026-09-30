export const SURFACES = ["FLOOR", "WALL"] as const
export type Surface = (typeof SURFACES)[number]

export const PRODUCT_CATEGORIES = [
  "PISOS",
  "VINILICOS",
  "PORCELANATOS",
  "REVESTIMENTOS",
  "CARPETES",
] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  PISOS: "Pisos",
  VINILICOS: "Vinílicos",
  PORCELANATOS: "Porcelanatos",
  REVESTIMENTOS: "Revestimentos",
  CARPETES: "Carpetes",
}

export type TextureKind = "wood" | "marble" | "concrete" | "stone" | "paint"
export type TextureAxis = "depth" | "grid"

export type InpaintingProviderId = "mock" | "openai" | "replicate"

export const MAX_ENV_UPLOAD_BYTES = 10 * 1024 * 1024
export const ACCEPTED_ENV_MIME = ["image/jpeg", "image/png", "image/webp"] as const
export const MAX_LONG_EDGE_PX = 2048

export interface CatalogProduct {
  id: string
  sku: string
  name: string
  brand: string
  category: ProductCategory
  finish?: string
  hex?: string
  dimensions?: string
  texture: TextureKind
  accentHex: string
  surface: Surface
  textureUrl: string
  tileScale: number
  textureAxis: TextureAxis
}

export interface InpaintingProductInput {
  name: string
  sku: string
  category: ProductCategory
  brand?: string
  finish?: string
  hex?: string
  dimensions?: string
  texture: TextureKind
  accentHex: string
  surface?: Surface
  textureUrl?: string
  tileScale?: number
  textureAxis?: TextureAxis
}

/** 255 marks pixels the provider may change. Length is width × height. */
export interface InpaintingRequest {
  width: number
  height: number
  surface: Surface
  product: InpaintingProductInput
  technicalPrompt: string
  mask: Uint8Array
}

export interface InpaintingResultMeta {
  provider: string
  model: string
  processingMs: number
  estimatedCostBrl: number
  technicalPrompt: string
  retryCount: number
}

/**
 * Pluggable inpainting provider.
 * The premium material path does not use this as the texture engine.
 */
export interface InpaintingAdapter<TSource, TImage> {
  readonly name: string
  readonly model: string
  generate(
    request: InpaintingRequest,
    source: TSource,
  ): Promise<{ image: TImage; meta: InpaintingResultMeta }>
}

export interface ClientRecord {
  id: string
  fullName: string
  email?: string
  document?: string
  phone?: string
  createdAt: string
}

export interface ProjectRecord {
  id: string
  clientId: string
  name: string
  createdAt: string
  hasPhoto: boolean
}

export interface GenerationRecord {
  id: string
  projectId: string
  surface: Surface
  productId: string
  productName: string
  productSku: string
  createdAt: string
  status: "SUCCEEDED" | "FAILED"
  provider: string
  model: string
  processingMs: number
  estimatedCostBrl: number
  technicalPrompt: string
}
