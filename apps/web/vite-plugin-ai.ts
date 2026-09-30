import { loadEnv, type Plugin } from "vite"
import { createAiMiddleware } from "./server/ai-handler.ts"
import { readServerAiEnv, type ServerAiEnv } from "./server/env.ts"

const emptyEnv: ServerAiEnv = {
  replicateToken: "",
  openaiKey: "",
  segmentationProvider: "auto",
  inpaintingProvider: "auto",
  segmentModel: "simbrams/segformer-b5-finetuned-ade-640-640",
  inpaintModel: "black-forest-labs/flux-fill-pro",
  openaiSegmentModel: "gpt-4.1-mini",
  openaiInpaintModel: "gpt-image-1.5",
  openaiImageQuality: "low",
}

/**
 * Local routes for segmentation and inpainting.
 * Keys stay in the dev server (apps/web/.env.local), never in the browser bundle.
 */
export function seenowAiPlugin(): Plugin {
  let env = emptyEnv
  return {
    name: "seenow-ai",
    configResolved(config) {
      env = readServerAiEnv(loadEnv(config.mode, config.envDir, ""))
    },
    configureServer(server) {
      server.middlewares.use(createAiMiddleware(() => env))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createAiMiddleware(() => env))
    },
  }
}
