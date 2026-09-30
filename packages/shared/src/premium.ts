/** ADE20K class ids used by SegFormer (`nvidia/segformer-*-finetuned-ade-*`). */
export const ADE20K = {
  wall: 0,
  floor: 3,
  ceiling: 5,
} as const

export const SEGFORMER_B5 = "nvidia/segformer-b5-finetuned-ade-640-640"
export const SEGFORMER_B2 = "nvidia/segformer-b2-finetuned-ade-512-512"
export const REPLICATE_SEGFORMER = "simbrams/segformer-b5-finetuned-ade-640-640"
export const GROUNDED_SAM = "schananas/grounded_sam"
export const FAL_FLUX_FILL = "fal-ai/flux-pro/v1/fill"
export const REPLICATE_FLUX_FILL = "black-forest-labs/flux-fill-pro"
export const DEPTH_ANYTHING_V2 = "depth-anything/Depth-Anything-V2-Small-hf"
export const PERSPECTIVE_WARP_MODEL = "perspective-warp-v1"
export const GEOMETRIC_MASK_MODEL = "geometric-trapezoid-v1"

const FLOOR_CLASS_NAMES = new Set(["floor", "flooring", "rug"])
const WALL_CLASS_NAMES = new Set(["wall"])
const CEILING_CLASS_NAMES = new Set(["ceiling"])

export type PremiumProvider = "huggingface" | "replicate" | "fal" | "local" | "unconfigured"

export type PremiumStage = {
  provider: PremiumProvider
  model: string
  configured: boolean
  label: string
}

export type PremiumPublicStatus = {
  segmentation: PremiumStage
  polish: PremiumStage
  material: PremiumStage
  depth: PremiumStage
  sam: { configured: boolean; model: string }
  openaiUnused: boolean
}

export type PremiumEnvInput = {
  hfToken: string
  replicateToken: string
  falKey: string
  openaiKey: string
  segmentationProvider?: string
  polishProvider?: string
  depthProvider?: string
  hfSegmentModel?: string
  hfSegmentFallbackModel?: string
  replicateSegmentModel?: string
  replicateSamModel?: string
  falModel?: string
  replicatePolishModel?: string
  hfDepthModel?: string
}

export function adeClassBucket(label: string): "floor" | "wall" | "ceiling" | null {
  const name = label.trim().toLowerCase()
  if (FLOOR_CLASS_NAMES.has(name)) return "floor"
  if (WALL_CLASS_NAMES.has(name)) return "wall"
  if (CEILING_CLASS_NAMES.has(name)) return "ceiling"
  return null
}

function stage(
  provider: PremiumProvider,
  model: string,
  configured: boolean,
  label: string,
): PremiumStage {
  return { provider, model, configured, label }
}

/**
 * Premium path resolver.
 * OpenAI is never selected. Missing keys stay `unconfigured` — never a color heuristic.
 */
export function resolvePremiumProviders(input: PremiumEnvInput): PremiumPublicStatus {
  const segmentationRequest = (input.segmentationProvider || "auto").trim().toLowerCase()
  const polishRequest = (input.polishProvider || "auto").trim().toLowerCase()
  const depthRequest = (input.depthProvider || "auto").trim().toLowerCase()
  const hfModel = input.hfSegmentModel?.trim() || SEGFORMER_B5
  const replicateSegment = input.replicateSegmentModel?.trim() || REPLICATE_SEGFORMER
  const falModel = input.falModel?.trim() || FAL_FLUX_FILL
  const replicatePolish = input.replicatePolishModel?.trim() || REPLICATE_FLUX_FILL
  const depthModel = input.hfDepthModel?.trim() || DEPTH_ANYTHING_V2
  const samModel = input.replicateSamModel?.trim() || GROUNDED_SAM

  let segmentation: PremiumStage
  if (segmentationRequest === "off" || segmentationRequest === "none") {
    segmentation = stage("unconfigured", "none", false, "SegFormer desligado")
  } else if (segmentationRequest === "huggingface" || segmentationRequest === "hf") {
    segmentation = input.hfToken
      ? stage("huggingface", hfModel, true, "SegFormer ADE20K · Hugging Face")
      : stage("unconfigured", hfModel, false, "SegFormer não configurado")
  } else if (segmentationRequest === "replicate") {
    segmentation = input.replicateToken
      ? stage("replicate", replicateSegment, true, "SegFormer ADE20K · Replicate")
      : stage("unconfigured", replicateSegment, false, "SegFormer não configurado")
  } else if (input.hfToken) {
    segmentation = stage("huggingface", hfModel, true, "SegFormer ADE20K · Hugging Face")
  } else if (input.replicateToken) {
    segmentation = stage("replicate", replicateSegment, true, "SegFormer ADE20K · Replicate")
  } else {
    segmentation = stage("unconfigured", "none", false, "SegFormer não configurado")
  }

  let polish: PremiumStage
  if (polishRequest === "off" || polishRequest === "none") {
    polish = stage("unconfigured", "none", false, "Flux Fill desligado")
  } else if (polishRequest === "fal") {
    polish = input.falKey
      ? stage("fal", falModel, true, "Flux Fill · Fal")
      : stage("unconfigured", falModel, false, "Flux Fill não configurado")
  } else if (polishRequest === "replicate") {
    polish = input.replicateToken
      ? stage("replicate", replicatePolish, true, "Flux Fill · Replicate")
      : stage("unconfigured", replicatePolish, false, "Flux Fill não configurado")
  } else if (input.falKey) {
    polish = stage("fal", falModel, true, "Flux Fill · Fal")
  } else if (input.replicateToken) {
    polish = stage("replicate", replicatePolish, true, "Flux Fill · Replicate")
  } else {
    polish = stage("unconfigured", "none", false, "Flux Fill não configurado")
  }

  const depth =
    depthRequest === "off" || depthRequest === "none" || !input.hfToken
      ? stage("unconfigured", depthModel, false, "Depth Anything desligado")
      : stage("huggingface", depthModel, true, "Depth Anything V2 · Hugging Face")

  return {
    segmentation,
    polish,
    material: stage("local", PERSPECTIVE_WARP_MODEL, true, "Textura em perspectiva"),
    depth,
    sam: {
      configured: Boolean(input.replicateToken) && segmentation.configured,
      model: samModel,
    },
    openaiUnused: Boolean(input.openaiKey),
  }
}

export function estimatePipelineCostBrl(segmentationProvider: string, polishProvider: string): number {
  const usd =
    (segmentationProvider === "replicate" ? 0.005 : 0) +
    (polishProvider === "fal" || polishProvider === "replicate" ? 0.05 : 0)
  return Math.round(usd * 5.4 * 100) / 100
}

export function buildFluxPolishPrompt(product: {
  name: string
  finish?: string
  dimensions?: string
  surface: "FLOOR" | "WALL"
}): string {
  const target = product.surface === "FLOOR" ? "floor" : "wall"
  return [
    `Photorealistic interior photograph. The white mask is only the seam band of catalog material "${product.name}" already composited onto the ${target}.`,
    product.finish ? `Finish: ${product.finish}.` : "",
    product.dimensions ? `Module: ${product.dimensions}.` : "",
    "Preserve the exact plank, tile, grout, color and scale already visible inside the mask.",
    "Only repair the cut edge, contact shadow and reflection continuity where the mask meets furniture and walls.",
    "Do not invent a different material. Do not move furniture, windows, doors or people.",
  ]
    .filter((part) => part.length > 0)
    .join(" ")
}
