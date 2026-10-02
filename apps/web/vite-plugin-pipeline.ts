import { SEGFORMER_B2, SEGFORMER_B5 } from "../../packages/shared/src/index.ts"
import { loadEnv, type Plugin } from "vite"
import { readPipelineEnv } from "./server/env.ts"
import { createPipelineMiddleware } from "./server/pipeline-handler.ts"

const empty = readPipelineEnv({})

/**
 * Premium routes for SegFormer, Depth Anything and Flux Fill.
 * Keys stay in the Vite server (apps/web/.env.local) and are not bundled.
 */
export function seenowPipelinePlugin(): Plugin {
  let context = {
    plan: empty.plan,
    secrets: empty.secrets,
    hfSegmentModel: SEGFORMER_B5,
    hfSegmentFallbackModel: SEGFORMER_B2,
  }
  return {
    name: "seenow-pipeline",
    configResolved(config) {
      const loaded = readPipelineEnv(loadEnv(config.mode, config.envDir, ""))
      context = {
        plan: loaded.plan,
        secrets: loaded.secrets,
        hfSegmentModel: loaded.input.hfSegmentModel || SEGFORMER_B5,
        hfSegmentFallbackModel: loaded.input.hfSegmentFallbackModel || SEGFORMER_B2,
      }
    },
    configureServer(server) {
      server.middlewares.use(createPipelineMiddleware(() => context))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createPipelineMiddleware(() => context))
    },
  }
}
