export type ServerAiEnv = {
  replicateToken: string
  openaiKey: string
  segmentationProvider: string
  inpaintingProvider: string
  segmentModel: string
  inpaintModel: string
  openaiSegmentModel: string
  openaiInpaintModel: string
  openaiImageQuality: string
}

const DEFAULT_SEGMENT_MODEL = "simbrams/segformer-b5-finetuned-ade-640-640"
const DEFAULT_INPAINT_MODEL = "black-forest-labs/flux-fill-pro"
const USD_TO_BRL = 5.22

export function readServerAiEnv(loaded: Record<string, string>): ServerAiEnv {
  const pick = (name: string) => (loaded[name] ?? process.env[name] ?? "").trim()
  const quality = (pick("OPENAI_IMAGE_QUALITY") || "low").toLowerCase()
  return {
    replicateToken: pick("REPLICATE_API_TOKEN"),
    openaiKey: pick("OPENAI_API_KEY"),
    segmentationProvider: (pick("SEGMENTATION_PROVIDER") || "auto").toLowerCase(),
    inpaintingProvider: (pick("INPAINTING_PROVIDER") || "auto").toLowerCase(),
    segmentModel: pick("REPLICATE_SEGMENT_MODEL") || DEFAULT_SEGMENT_MODEL,
    inpaintModel: pick("REPLICATE_INPAINT_MODEL") || DEFAULT_INPAINT_MODEL,
    openaiSegmentModel: pick("OPENAI_SEGMENT_MODEL") || "gpt-4.1-mini",
    openaiInpaintModel: pick("OPENAI_INPAINT_MODEL") || "gpt-image-1.5",
    openaiImageQuality: quality === "medium" || quality === "high" ? quality : "low",
  }
}

export type ResolvedProvider = {
  provider: "replicate" | "openai" | "heuristic" | "mock"
  model: string
  label: string
}

export function resolveSegmentation(env: ServerAiEnv): ResolvedProvider {
  const requested = env.segmentationProvider
  if (requested === "replicate" || (requested === "auto" && env.replicateToken)) {
    if (!env.replicateToken) return heuristicProvider()
    return {
      provider: "replicate",
      model: env.segmentModel,
      label: env.segmentModel.toLowerCase().includes("grounded")
        ? "Segment Anything com prompt de piso ou parede (Replicate)"
        : "Segmentação semântica ADE20K (Replicate)",
    }
  }
  if (requested === "openai" && env.openaiKey) {
    return {
      provider: "openai",
      model: env.openaiSegmentModel,
      label: "OpenAI, contorno da região",
    }
  }
  return heuristicProvider()
}

export function resolveInpainting(env: ServerAiEnv, requestedRaw: string): ResolvedProvider {
  const requested = (requestedRaw || env.inpaintingProvider || "auto").toLowerCase()
  if (requested === "mock") return mockProvider()
  if (requested === "replicate" || (requested === "auto" && env.replicateToken)) {
    if (!env.replicateToken) return mockProvider()
    return {
      provider: "replicate",
      model: env.inpaintModel,
      label: "Inpainting Replicate, composto só na região",
    }
  }
  if (requested === "openai" || (requested === "auto" && env.openaiKey)) {
    if (!env.openaiKey) return mockProvider()
    return {
      provider: "openai",
      model: env.openaiInpaintModel,
      label: "Inpainting OpenAI, composto só na região",
    }
  }
  return mockProvider()
}

function heuristicProvider(): ResolvedProvider {
  return {
    provider: "heuristic",
    model: "room-color-region-v1",
    label: "Estimativa local pela foto",
  }
}

function mockProvider(): ResolvedProvider {
  return {
    provider: "mock",
    model: "local-composite-v1",
    label: "Simulação local, só dentro da região",
  }
}

export function estimatedCostBrl(provider: string, quality: string): number {
  if (provider === "replicate") return roundMoney(0.05 * USD_TO_BRL)
  if (provider === "openai") {
    const usd = quality === "high" ? 0.08 : quality === "medium" ? 0.05 : 0.02
    return roundMoney(usd * USD_TO_BRL)
  }
  return 0
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
