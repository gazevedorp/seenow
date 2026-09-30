import {
  buildTechnicalPrompt,
  type InpaintingAdapter,
  type InpaintingRequest,
  type InpaintingResultMeta,
} from "@seenow/shared"
import { compositeMasked } from "@/lib/compose"
import { delay } from "@/lib/format"
import { canvasToBlob } from "@/lib/images"
import { maskHorizonRatio } from "@/lib/mask"
import { drawTexture, parseColor, relight } from "@/lib/textures"

export { buildTechnicalPrompt }

/**
 * Local composite used when no inpainting API is configured.
 * Pixels with mask 0 stay identical to the source. Masked pixels take the
 * product texture, relit by the original photo.
 */
export class MockInpaintingAdapter implements InpaintingAdapter<HTMLCanvasElement, Blob> {
  readonly name = "mock"
  readonly model = "local-composite-v1"

  async generate(
    request: InpaintingRequest,
    source: HTMLCanvasElement,
  ): Promise<{ image: Blob; meta: InpaintingResultMeta }> {
    const started = performance.now()
    await delay(280)

    const { width, height, mask, product, surface } = request
    if (mask.length !== width * height) {
      throw new Error("A máscara não tem o mesmo tamanho da foto.")
    }

    const sourceContext = source.getContext("2d", { willReadFrequently: true })
    if (!sourceContext) throw new Error("Não foi possível ler a foto do ambiente.")
    const sourceImage = sourceContext.getImageData(0, 0, width, height)

    const textureCanvas = document.createElement("canvas")
    textureCanvas.width = width
    textureCanvas.height = height
    const textureContext = textureCanvas.getContext("2d", { willReadFrequently: true })
    if (!textureContext) throw new Error("Não foi possível montar a textura.")
    drawTexture(textureContext, product, surface, width, height, maskHorizonRatio(mask, width, height, surface))
    const textureImage = textureContext.getImageData(0, 0, width, height)

    const output = document.createElement("canvas")
    output.width = width
    output.height = height
    const outputContext = output.getContext("2d")
    if (!outputContext) throw new Error("Não foi possível compor o resultado.")
    const painted = new Uint8ClampedArray(sourceImage.data.length)
    const [paintR, paintG, paintB] = parseColor(product.hex, product.accentHex)
    const paint = product.texture === "paint"

    for (let index = 0; index < mask.length; index++) {
      const offset = index * 4
      const sr = sourceImage.data[offset] ?? 0
      const sg = sourceImage.data[offset + 1] ?? 0
      const sb = sourceImage.data[offset + 2] ?? 0
      const tr = textureImage.data[offset] ?? 0
      const tg = textureImage.data[offset + 1] ?? 0
      const tb = textureImage.data[offset + 2] ?? 0
      painted[offset] = paint ? (sr * paintR) / 255 : relight(tr, sr)
      painted[offset + 1] = paint ? (sg * paintG) / 255 : relight(tg, sg)
      painted[offset + 2] = paint ? (sb * paintB) / 255 : relight(tb, sb)
      painted[offset + 3] = 255
    }

    const image = outputContext.createImageData(width, height)
    image.data.set(compositeMasked(sourceImage.data, painted, mask))
    outputContext.putImageData(image, 0, 0)
    const blob = await canvasToBlob(output, "image/jpeg", 0.92)
    return {
      image: blob,
      meta: {
        provider: this.name,
        model: this.model,
        processingMs: Math.round(performance.now() - started),
        estimatedCostBrl: 0,
        technicalPrompt: request.technicalPrompt,
        retryCount: 0,
      },
    }
  }
}
