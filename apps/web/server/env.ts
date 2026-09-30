import {
  resolvePremiumProviders,
  type PremiumEnvInput,
  type PremiumPublicStatus,
} from "../../../packages/shared/src/index.ts"

export type PipelineSecrets = {
  hfToken: string
  replicateToken: string
  falKey: string
}

export function readPipelineEnv(loaded: Record<string, string>): {
  plan: PremiumPublicStatus
  secrets: PipelineSecrets
  input: PremiumEnvInput
} {
  const pick = (name: string) => (loaded[name] ?? process.env[name] ?? "").trim()
  const input: PremiumEnvInput = {
    hfToken: pick("HF_TOKEN"),
    replicateToken: pick("REPLICATE_API_TOKEN"),
    falKey: pick("FAL_KEY"),
    openaiKey: pick("OPENAI_API_KEY"),
    segmentationProvider: pick("SEGMENTATION_PROVIDER"),
    polishProvider: pick("POLISH_PROVIDER"),
    depthProvider: pick("DEPTH_PROVIDER"),
    hfSegmentModel: pick("HF_SEGMENT_MODEL"),
    hfSegmentFallbackModel: pick("HF_SEGMENT_FALLBACK_MODEL"),
    replicateSegmentModel: pick("REPLICATE_SEGMENT_MODEL"),
    replicateSamModel: pick("REPLICATE_SAM_MODEL"),
    falModel: pick("FAL_FLUX_MODEL"),
    replicatePolishModel: pick("REPLICATE_POLISH_MODEL"),
    hfDepthModel: pick("HF_DEPTH_MODEL"),
  }
  return {
    input,
    plan: resolvePremiumProviders(input),
    secrets: {
      hfToken: input.hfToken,
      replicateToken: input.replicateToken,
      falKey: input.falKey,
    },
  }
}
