export {
  ACCEPTED_ENV_MIME,
  CATEGORY_LABEL,
  MAX_ENV_UPLOAD_BYTES,
  MAX_LONG_EDGE_PX,
  PRODUCT_CATEGORIES,
  SURFACES,
  type CatalogProduct,
  type ClientRecord,
  type GenerationRecord,
  type InpaintingAdapter,
  type InpaintingProductInput,
  type InpaintingProviderId,
  type InpaintingRequest,
  type InpaintingResultMeta,
  type ProductCategory,
  type ProjectRecord,
  type Surface,
  type TextureAxis,
  type TextureKind,
} from "./domain.ts"

export {
  CATALOG,
  categoryLabel,
  filterCatalog,
  findProduct,
  matchesSurface,
  swatchSurface,
} from "./catalog.ts"

export {
  ADE20K,
  DEPTH_ANYTHING_V2,
  FAL_FLUX_FILL,
  GEOMETRIC_MASK_MODEL,
  GROUNDED_SAM,
  PERSPECTIVE_WARP_MODEL,
  REPLICATE_FLUX_FILL,
  REPLICATE_SEGFORMER,
  SEGFORMER_B2,
  SEGFORMER_B5,
  adeClassBucket,
  buildFluxPolishPrompt,
  estimatePipelineCostBrl,
  resolvePremiumProviders,
  type PremiumEnvInput,
  type PremiumProvider,
  type PremiumPublicStatus,
  type PremiumStage,
} from "./premium.ts"

export {
  applyHomography,
  homographyFromPoints,
  integrateDepthV,
  invert3x3,
  quadFromMask,
  type Point,
  type Quad,
} from "./geometry.ts"

export {
  assessSurfaceMask,
  boxBlurMask,
  cleanupSurfaceMask,
  combineRoomMasks,
  dilateMask,
  edgeBand,
  erodeMask,
  maskCoverage,
  orMasks,
  removeSmallComponents,
  subtractMask,
  thresholdMask,
  type MaskAssessment,
} from "./mask-ops.ts"

export { luminance, relightTexture, softLight } from "./lighting.ts"

import { CATEGORY_LABEL, type CatalogProduct, type InpaintingProductInput, type Surface } from "./domain.ts"

export function surfaceLabel(surface: Surface): string {
  return surface === "FLOOR" ? "Piso" : "Parede"
}

export function productToInput(product: CatalogProduct): InpaintingProductInput {
  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    brand: product.brand,
    finish: product.finish,
    hex: product.hex,
    dimensions: product.dimensions,
    texture: product.texture,
    accentHex: product.accentHex,
    surface: product.surface,
    textureUrl: product.textureUrl,
    tileScale: product.tileScale,
    textureAxis: product.textureAxis,
  }
}

export function buildTechnicalPrompt(surface: Surface, product: InpaintingProductInput): string {
  const target = surface === "FLOOR" ? "piso" : "parede"
  const parts = [
    `A textura do catálogo entra só na máscara de ${target}, com perspectiva e a luz da foto.`,
    `Produto: ${product.name} (SKU ${product.sku}), categoria ${CATEGORY_LABEL[product.category]}.`,
    product.brand ? `Marca ${product.brand}.` : "",
    product.finish ? `Acabamento ${product.finish}.` : "",
    product.dimensions ? `Formato ${product.dimensions}.` : "",
    "Não inventar outro material. Fora da máscara, a foto permanece original.",
    "O polimento Flux, quando houver chave, só trata emenda, sombra de contato e reflexo.",
  ]
  return parts.filter((part) => part.length > 0).join(" ")
}
