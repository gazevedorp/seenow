import type {
  InpaintingAdapter,
  InpaintingProviderId,
  InpaintingRequest,
  InpaintingResultMeta,
} from "@seenow/shared"
import { canvasToBlob, maskToPng } from "@/lib/images"

const FRONT_TIMEOUT_MS = 170_000

/**
 * Phase 2 calls the Nest API. The browser never holds a provider secret.
 * Client name, document and phone are not part of this payload.
 */
export class RemoteInpaintingAdapter implements InpaintingAdapter<HTMLCanvasElement, Blob> {
  readonly model = "remote"
  readonly name: Exclude<InpaintingProviderId, "mock">
  private readonly apiUrl: string

  constructor(name: Exclude<InpaintingProviderId, "mock">, apiUrl: string) {
    this.name = name
    this.apiUrl = apiUrl
  }

  async generate(
    request: InpaintingRequest,
    source: HTMLCanvasElement,
  ): Promise<{ image: Blob; meta: InpaintingResultMeta }> {
    const started = performance.now()
    const body = new FormData()
    body.set("image", await canvasToBlob(source), "ambiente.jpg")
    body.set("mask", await maskToPng(request.mask, request.width, request.height), "mascara.png")
    body.set("surface", request.surface)
    body.set(
      "product",
      JSON.stringify({
        name: request.product.name,
        sku: request.product.sku,
        category: request.product.category,
        brand: request.product.brand,
        finish: request.product.finish,
        hex: request.product.hex,
        dimensions: request.product.dimensions,
        texture: request.product.texture,
      }),
    )
    body.set("technicalPrompt", request.technicalPrompt)
    body.set("provider", this.name)

    let response: Response
    try {
      response = await fetch(`${this.apiUrl}/generations`, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(FRONT_TIMEOUT_MS),
      })
    } catch {
      throw new Error("A API de geração não respondeu. Confira VITE_API_URL ou volte ao modo mock.")
    }

    if (!response.ok) {
      throw new Error(`A API recusou a geração (${response.status}).`)
    }
    const image = await response.blob()
    if (!image.type.startsWith("image/")) {
      throw new Error("A API não devolveu uma imagem.")
    }
    return {
      image,
      meta: {
        provider: this.name,
        model: response.headers.get("x-seenow-model") ?? "remote",
        processingMs: Math.round(performance.now() - started),
        estimatedCostBrl: Number(response.headers.get("x-seenow-cost-brl") ?? "0") || 0,
        technicalPrompt: request.technicalPrompt,
        retryCount: 0,
      },
    }
  }
}
