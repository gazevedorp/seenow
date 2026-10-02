import { orMasks } from "@seenow/shared"

async function decodeImage(base64: string, width: number, height: number): Promise<ImageData> {
  const response = await fetch(`data:image/png;base64,${base64}`)
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error("Não foi possível ler a máscara.")
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return context.getImageData(0, 0, width, height)
}

export async function pngBase64ToMask(base64: string, width: number, height: number): Promise<Uint8Array> {
  const image = await decodeImage(base64, width, height)
  const mask = new Uint8Array(width * height)
  for (let index = 0; index < mask.length; index++) {
    const offset = index * 4
    const alpha = image.data[offset + 3] ?? 0
    const tone =
      ((image.data[offset] ?? 0) + (image.data[offset + 1] ?? 0) + (image.data[offset + 2] ?? 0)) / 3
    mask[index] = alpha > 16 && tone >= 128 ? 255 : 0
  }
  return mask
}

export async function pngBase64ToDepth(base64: string, width: number, height: number): Promise<Float32Array> {
  const image = await decodeImage(base64, width, height)
  const depth = new Float32Array(width * height)
  for (let index = 0; index < depth.length; index++) {
    const offset = index * 4
    const tone =
      0.2126 * (image.data[offset] ?? 0) +
      0.7152 * (image.data[offset + 1] ?? 0) +
      0.0722 * (image.data[offset + 2] ?? 0)
    depth[index] = tone / 255
  }
  return depth
}

export async function unionPngMasks(masks: string[], width: number, height: number): Promise<Uint8Array> {
  if (masks.length === 0) return new Uint8Array(width * height)
  const decoded = await Promise.all(masks.map((mask) => pngBase64ToMask(mask, width, height)))
  return orMasks(decoded, width * height)
}
