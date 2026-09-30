import type { InpaintingAdapter, InpaintingRequest, InpaintingResultMeta } from "@seenow/shared"
import { clipBlobToMask } from "@/lib/clip-mask"
import { canvasToBlob } from "@/lib/images"
import { MockInpaintingAdapter } from "@/lib/inpainting/mock-adapter"
import { bytesToBase64 } from "@/lib/segmentation/segment-room"

const FRONT_TIMEOUT_MS = 170_000

/**
 * Calls the Vite dev server, which holds REPLICATE_API_TOKEN / OPENAI_API_KEY.
 * Without a key, or if the provider fails, the local composite is used.
 * The browser never sees the secret. Outside the mask, pixels stay original.
 */
export class LocalApiInpaintingAdapter implements InpaintingAdapter<HTMLCanvasElement, Blob> {
  readonly name = "auto"
  readonly model = "local-or-provider"
  private readonly requested: string

  constructor(requested: string) {
    this.requested = requested
  }

  async generate(
    request: InpaintingRequest,
    source: HTMLCanvasElement,
  ): Promise<{ image: Blob; meta: InpaintingResultMeta }> {
    const mock = new MockInpaintingAdapter()
    try {
      const image = await canvasToBlob(source, "image/jpeg", 0.9)
      const response = await fetch("/api/inpaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: await blobToBase64(image),
          imageMime: "image/jpeg",
          width: request.width,
          height: request.height,
          surface: request.surface,
          maskBase64: bytesToBase64(request.mask),
          technicalPrompt: request.technicalPrompt,
          provider: this.requested,
          product: {
            name: request.product.name,
            sku: request.product.sku,
            category: request.product.category,
            brand: request.product.brand,
            finish: request.product.finish,
            hex: request.product.hex,
            dimensions: request.product.dimensions,
          },
        }),
        signal: AbortSignal.timeout(FRONT_TIMEOUT_MS),
      })
      const contentType = response.headers.get("content-type") ?? ""
      if (response.ok && contentType.includes("application/json")) {
        const payload = (await response.json()) as { fallback?: boolean; note?: string }
        if (payload.fallback && (this.requested === "openai" || this.requested === "replicate")) {
          throw new Error(payload.note || "O provedor de inpainting não está disponível.")
        }
        return mock.generate(request, source)
      }
      if (response.ok && contentType.startsWith("image/")) {
        const generated = await response.blob()
        return {
          image: await clipBlobToMask(source, generated, request.mask),
          meta: {
            provider: response.headers.get("x-seenow-provider") ?? this.requested,
            model: response.headers.get("x-seenow-model") ?? "remote",
            processingMs: Number(response.headers.get("x-seenow-ms") ?? "0") || 0,
            estimatedCostBrl: Number(response.headers.get("x-seenow-cost-brl") ?? "0") || 0,
            technicalPrompt: request.technicalPrompt,
            retryCount: Number(response.headers.get("x-seenow-retries") ?? "0") || 0,
          },
        }
      }
    } catch (error) {
      if (this.requested === "openai" || this.requested === "replicate") {
        throw error instanceof Error ? error : new Error("A geração remota falhou.")
      }
      return mock.generate(request, source)
    }
    return mock.generate(request, source)
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  const step = 0x8000
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step))
  }
  return btoa(binary)
}
