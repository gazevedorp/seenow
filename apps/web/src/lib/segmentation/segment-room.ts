import type { SegmentationMeta, Surface } from "@seenow/shared"
import { canvasToBlob } from "@/lib/images"
import { segmentHeuristic } from "@/lib/segmentation/heuristic"

export type SegmentOutcome = {
  mask: Uint8Array
  meta: SegmentationMeta
  note: string
}

type SegmentResponse = {
  provider?: string
  model?: string
  fallback?: boolean
  processingMs?: number
  retryCount?: number
  note?: string
  masks?: Array<{ pngBase64?: string }>
}

type AiStatus = {
  segmentation?: { provider?: string }
}

const cache = new Map<string, Promise<SegmentOutcome>>()
let modePromise: Promise<"remote" | "local"> | null = null

function fingerprint(data: Uint8ClampedArray, width: number, height: number, surface: Surface): string {
  let hash = width * 131 + height
  const pixels = data.length / 4
  const step = Math.max(1, Math.floor(pixels / 64))
  for (let index = 0; index < pixels; index += step) {
    const offset = index * 4
    hash = (Math.imul(hash, 33) + (data[offset] ?? 0) + (data[offset + 1] ?? 0) * 3 + (data[offset + 2] ?? 0) * 7) >>> 0
  }
  return `${surface}:${width}x${height}:${hash}`
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

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const step = 0x8000
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step))
  }
  return btoa(binary)
}

async function segmentationMode(): Promise<"remote" | "local"> {
  if (!modePromise) {
    modePromise = fetch("/api/ai-status")
      .then(async (response) => {
        if (!response.ok) return "local" as const
        const body = (await response.json()) as AiStatus
        const provider = body.segmentation?.provider
        return provider === "replicate" || provider === "openai" ? "remote" : "local"
      })
      .catch(() => "local" as const)
  }
  return modePromise
}

async function pngBase64ToMask(pngBase64: string, width: number, height: number): Promise<Uint8Array> {
  const binary = atob(pngBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }))
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
  const image = context.getImageData(0, 0, width, height)
  const mask = new Uint8Array(width * height)
  for (let index = 0; index < mask.length; index++) {
    const offset = index * 4
    const alpha = image.data[offset + 3] ?? 0
    const luma = ((image.data[offset] ?? 0) + (image.data[offset + 1] ?? 0) + (image.data[offset + 2] ?? 0)) / 3
    mask[index] = alpha < 16 || luma < 128 ? 0 : 255
  }
  return mask
}

function localOutcome(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  surface: Surface,
  prefix?: string,
): SegmentOutcome {
  const started = performance.now()
  const segmented = segmentHeuristic(data, width, height, surface)
  const name = surface === "FLOOR" ? "piso" : "parede"
  const base =
    segmented.source === "geometric"
      ? `Não deu para separar o ${name} pelas cores da foto. Aplicamos um recorte automático — ajuste se precisar.`
      : `Região do ${name} estimada pelas cores da foto. O pincel é só um ajuste fino.`
  return {
    mask: segmented.mask,
    meta: {
      provider: "heuristic",
      model: segmented.source === "geometric" ? "geometric-split-v1" : "room-color-region-v1",
      processingMs: Math.round(performance.now() - started),
      retryCount: 0,
    },
    note: prefix ? `${prefix} ${base}` : base,
  }
}

export async function segmentRoom(
  canvas: HTMLCanvasElement,
  surface: Surface,
  options?: { fresh?: boolean },
): Promise<SegmentOutcome> {
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("Não foi possível ler a foto do ambiente.")
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const key = fingerprint(image.data, canvas.width, canvas.height, surface)
  if (!options?.fresh) {
    const cached = cache.get(key)
    if (cached) return cached
  }
  const pending = runSegment(canvas, image.data, surface)
  cache.set(key, pending)
  if (cache.size > 8) {
    const oldest = cache.keys().next().value
    if (oldest && oldest !== key) cache.delete(oldest)
  }
  try {
    return await pending
  } catch (error) {
    cache.delete(key)
    throw error
  }
}

async function runSegment(
  canvas: HTMLCanvasElement,
  data: Uint8ClampedArray,
  surface: Surface,
): Promise<SegmentOutcome> {
  const mode = await segmentationMode()
  if (mode === "remote") {
    try {
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.86)
      const response = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: await blobToBase64(blob),
          imageMime: "image/jpeg",
          width: canvas.width,
          height: canvas.height,
          surface,
        }),
        signal: AbortSignal.timeout(100_000),
      })
      if (response.ok) {
        const payload = (await response.json()) as SegmentResponse
        if (!payload.fallback && payload.masks && payload.masks.length > 0) {
          const mask = new Uint8Array(canvas.width * canvas.height)
          for (const part of payload.masks) {
            if (!part.pngBase64) continue
            const decoded = await pngBase64ToMask(part.pngBase64, canvas.width, canvas.height)
            for (let index = 0; index < mask.length; index++) {
              if ((decoded[index] ?? 0) >= 128) mask[index] = 255
            }
          }
          let marked = 0
          for (const value of mask) if (value >= 128) marked += 1
          if (marked / mask.length >= 0.02) {
            const name = surface === "FLOOR" ? "piso" : "parede"
            const remoteNote =
              payload.provider === "openai"
                ? `Contorno do ${name} sugerido pela OpenAI. Confira antes de gerar.`
                : `Região do ${name} encontrada automaticamente. Ajuste só se precisar.`
            return {
              mask,
              meta: {
                provider: payload.provider ?? "replicate",
                model: payload.model ?? "remote",
                processingMs: payload.processingMs ?? 0,
                retryCount: payload.retryCount ?? 0,
              },
              note: remoteNote,
            }
          }
        }
        return localOutcome(data, canvas.width, canvas.height, surface, payload.note)
      }
    } catch {
      return localOutcome(
        data,
        canvas.width,
        canvas.height,
        surface,
        "A segmentação remota não respondeu.",
      )
    }
  }
  return localOutcome(data, canvas.width, canvas.height, surface)
}
