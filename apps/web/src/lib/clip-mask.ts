import { compositeMasked } from "@/lib/compose"
import { canvasToBlob } from "@/lib/images"

/** Resize a provider image to the working photo and keep every unmasked pixel original. */
export async function clipBlobToMask(
  source: HTMLCanvasElement,
  generated: Blob,
  mask: Uint8Array,
): Promise<Blob> {
  const width = source.width
  const height = source.height
  if (mask.length !== width * height) {
    throw new Error("A máscara não tem o mesmo tamanho da foto.")
  }
  const bitmap = await createImageBitmap(generated)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  const sourceContext = source.getContext("2d", { willReadFrequently: true })
  if (!context || !sourceContext) {
    bitmap.close()
    throw new Error("Não foi possível compor o resultado.")
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const generatedImage = context.getImageData(0, 0, width, height)
  const sourceImage = sourceContext.getImageData(0, 0, width, height)
  const image = context.createImageData(width, height)
  image.data.set(compositeMasked(sourceImage.data, generatedImage.data, mask))
  context.putImageData(image, 0, 0)
  return canvasToBlob(canvas, "image/jpeg", 0.92)
}
