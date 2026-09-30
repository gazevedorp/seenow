import { ACCEPTED_ENV_MIME, MAX_ENV_UPLOAD_BYTES, MAX_LONG_EDGE_PX } from "@seenow/shared"
import { formatBytes } from "@/lib/format"

const ACCEPTED = new Set<string>(ACCEPTED_ENV_MIME)

export function validateEnvironmentFile(file: File): string | null {
  const typeOk = ACCEPTED.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)
  if (!typeOk) return "Envie uma foto JPEG, PNG ou WEBP."
  if (file.size > MAX_ENV_UPLOAD_BYTES) {
    return `Essa foto tem ${formatBytes(file.size)}. O limite é 10 MB.`
  }
  return null
}

export async function fileToWorkingCanvas(file: File): Promise<{
  canvas: HTMLCanvasElement
  originalWidth: number
  originalHeight: number
}> {
  const problem = validateEnvironmentFile(file)
  if (problem) throw new Error(problem)
  const bitmap = await createImageBitmap(file)
  const longEdge = Math.max(bitmap.width, bitmap.height)
  const scale = Math.min(1, MAX_LONG_EDGE_PX / longEdge)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error("Não foi possível preparar a imagem.")
  }
  context.drawImage(bitmap, 0, 0, width, height)
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  bitmap.close()
  return { canvas, originalWidth, originalHeight }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/jpeg",
  quality = 0.9,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Não foi possível exportar a imagem."))
      },
      type,
      quality,
    )
  })
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error("Não foi possível ler a foto salva.")
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}

export function maskToPng(mask: Uint8Array, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return Promise.reject(new Error("Não foi possível exportar a máscara."))
  const image = context.createImageData(width, height)
  for (let index = 0; index < mask.length; index++) {
    const value = mask[index] ?? 0
    const offset = index * 4
    image.data[offset] = value
    image.data[offset + 1] = value
    image.data[offset + 2] = value
    image.data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return canvasToBlob(canvas, "image/png")
}
