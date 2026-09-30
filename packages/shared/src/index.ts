export const SURFACES = ["FLOOR", "WALL"] as const;
export type Surface = (typeof SURFACES)[number];

export const PRODUCT_CATEGORIES = [
  "PISOS",
  "PORCELANATOS",
  "REVESTIMENTOS",
  "TINTAS",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  PISOS: "Pisos",
  PORCELANATOS: "Porcelanatos",
  REVESTIMENTOS: "Revestimentos",
  TINTAS: "Tintas",
};

export type TextureKind = "wood" | "marble" | "concrete" | "stone" | "paint";

export type InpaintingProviderId = "mock" | "openai" | "replicate";

/** Phase 1 providers. `heuristic` is the on-device photo estimate. */
export type SegmentationProviderId = "replicate" | "openai" | "heuristic";

export interface SegmentationMeta {
  provider: string;
  model: string;
  processingMs: number;
  retryCount: number;
}

export const MAX_ENV_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_ENV_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_LONG_EDGE_PX = 2048;

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: ProductCategory;
  finish?: string;
  hex?: string;
  dimensions?: string;
  texture: TextureKind;
  accentHex: string;
}

export interface InpaintingProductInput {
  name: string;
  sku: string;
  category: ProductCategory;
  brand?: string;
  finish?: string;
  hex?: string;
  dimensions?: string;
  texture: TextureKind;
  accentHex: string;
}

/** 255 marks pixels the provider may change. Length is width × height. */
export interface InpaintingRequest {
  width: number;
  height: number;
  surface: Surface;
  product: InpaintingProductInput;
  technicalPrompt: string;
  mask: Uint8Array;
}

export interface InpaintingResultMeta {
  provider: string;
  model: string;
  processingMs: number;
  estimatedCostBrl: number;
  technicalPrompt: string;
  retryCount: number;
}

/**
 * Pluggable inpainting provider.
 * Phase 1 ships a browser mock (`TSource` = canvas, `TImage` = Blob).
 * Phase 2 Nest adapter keeps this contract and swaps in Buffer-based providers.
 */
export interface InpaintingAdapter<TSource, TImage> {
  readonly name: string;
  readonly model: string;
  generate(
    request: InpaintingRequest,
    source: TSource,
  ): Promise<{ image: TImage; meta: InpaintingResultMeta }>;
}

export interface ClientRecord {
  id: string;
  fullName: string;
  email?: string;
  document?: string;
  phone?: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  clientId: string;
  name: string;
  createdAt: string;
  hasPhoto: boolean;
}

export interface GenerationRecord {
  id: string;
  projectId: string;
  surface: Surface;
  productId: string;
  productName: string;
  productSku: string;
  createdAt: string;
  status: "SUCCEEDED" | "FAILED";
  provider: string;
  model: string;
  processingMs: number;
  estimatedCostBrl: number;
  technicalPrompt: string;
}

export function surfaceLabel(surface: Surface): string {
  return surface === "FLOOR" ? "Piso" : "Parede";
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
  };
}

export function buildTechnicalPrompt(
  surface: Surface,
  product: InpaintingProductInput,
): string {
  const target = surface === "FLOOR" ? "piso" : "parede";
  const parts = [
    `Altere somente a área mascarada de ${target}.`,
    `Produto: ${product.name} (SKU ${product.sku}), categoria ${CATEGORY_LABEL[product.category]}.`,
    product.brand ? `Marca ${product.brand}.` : "",
    product.finish ? `Acabamento ${product.finish}.` : "",
    product.dimensions ? `Formato ${product.dimensions}.` : "",
    product.hex ? `Cor HEX ${product.hex}.` : "",
    "Preserve iluminação, perspectiva, móveis, portas, janelas e pessoas fora da máscara.",
    surface === "FLOOR"
      ? "Respeite a perspectiva do piso e as juntas quando possível."
      : "Aplique cor e textura sem plastificar a parede.",
  ];
  return parts.filter((part) => part.length > 0).join(" ");
}
