import { useEffect, useState } from "react"
import {
  GEOMETRIC_MASK_MODEL,
  PERSPECTIVE_WARP_MODEL,
  assessSurfaceMask,
  boxBlurMask,
  buildFluxPolishPrompt,
  combineRoomMasks,
  estimatePipelineCostBrl,
  maskCoverage,
  type CatalogProduct,
  type PremiumPublicStatus,
  type Surface,
} from "@seenow/shared"
import { blobToBase64, canvasToBase64, canvasToBlob, maskToPng, scaleCanvas } from "@/lib/images"
import { autoMask, fallbackWallMask } from "@/lib/mask"
import { compositeMaterial } from "@/lib/material/composite"
import { pngBase64ToDepth, pngBase64ToMask, unionPngMasks } from "@/lib/pipeline/decode-mask"

export type ClientPipelineStatus = PremiumPublicStatus & { reachable: boolean }

export type MaskSource = {
  provider: string
  model: string
  configured: boolean
  note: string | null
}

export type RoomDetection = {
  floor: Uint8Array
  wall: Uint8Array
  depth: Float32Array | null
  depthModel: string | null
  source: MaskSource
  status: ClientPipelineStatus
}

type SegmentPayload = {
  configured?: boolean
  provider?: string
  model?: string
  classes?: { floor?: string[]; wall?: string[]; ceiling?: string[]; rug?: string[] }
  depthPngBase64?: string | null
  depthModel?: string | null
  note?: string | null
  error?: string
}

const unreachable = (): ClientPipelineStatus => ({
  reachable: false,
  segmentation: {
    provider: "unconfigured",
    model: "indisponível",
    configured: false,
    label: "Status do provedor indisponível",
  },
  polish: {
    provider: "unconfigured",
    model: "indisponível",
    configured: false,
    label: "Status do provedor indisponível",
  },
  material: {
    provider: "local",
    model: PERSPECTIVE_WARP_MODEL,
    configured: true,
    label: "Textura em perspectiva",
  },
  depth: {
    provider: "unconfigured",
    model: "none",
    configured: false,
    label: "Depth Anything desligado",
  },
  sam: { configured: false, model: "schananas/grounded_sam" },
  openaiUnused: false,
})

export async function fetchPipelineStatus(): Promise<ClientPipelineStatus> {
  try {
    const response = await fetch("/api/pipeline-status", { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return unreachable()
    const body = (await response.json()) as PremiumPublicStatus
    if (!body?.segmentation || !body.polish || !body.material) return unreachable()
    return { ...body, reachable: true }
  } catch {
    return unreachable()
  }
}

function geometricDetection(canvas: HTMLCanvasElement, status: ClientPipelineStatus, note: string): RoomDetection {
  return {
    floor: autoMask(canvas.width, canvas.height, "FLOOR"),
    wall: autoMask(canvas.width, canvas.height, "WALL"),
    depth: null,
    depthModel: null,
    source: {
      provider: "geometric",
      model: GEOMETRIC_MASK_MODEL,
      configured: false,
      note,
    },
    status,
  }
}

async function samMask(
  canvas: HTMLCanvasElement,
  surface: Surface,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const scaled = scaleCanvas(canvas, 1280)
  const response = await fetch("/api/segment-sam", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: await canvasToBase64(scaled, "image/jpeg", 0.86),
      imageMime: "image/jpeg",
      surface,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const payload = (await response.json()) as { pngBase64?: string; error?: string; configured?: boolean }
  if (!response.ok || !payload.pngBase64) {
    throw new Error(payload.error || "Grounded SAM não devolveu máscara.")
  }
  return pngBase64ToMask(payload.pngBase64, width, height)
}

export async function detectRoom(canvas: HTMLCanvasElement): Promise<RoomDetection> {
  const status = await fetchPipelineStatus()
  if (!status.reachable) {
    return geometricDetection(
      canvas,
      status,
      "O servidor local não respondeu. O recorte é geométrico, não é SegFormer.",
    )
  }
  if (!status.segmentation.configured) {
    return geometricDetection(
      canvas,
      status,
      "Sem HF_TOKEN ou REPLICATE_API_TOKEN. Recorte geométrico — não é segmentação SegFormer.",
    )
  }

  const scaled = scaleCanvas(canvas, 1280)
  const response = await fetch("/api/segment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: await canvasToBase64(scaled, "image/jpeg", 0.86),
      imageMime: "image/jpeg",
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const payload = (await response.json()) as SegmentPayload
  if (!response.ok) {
    throw new Error(payload.error || "A segmentação SegFormer falhou.")
  }
  if (!payload.configured) {
    return geometricDetection(
      canvas,
      status,
      payload.note || "SegFormer não configurado. Recorte geométrico.",
    )
  }

  const width = canvas.width
  const height = canvas.height
  const classes = payload.classes ?? {}
  const [floorRaw, wallRaw, ceilingRaw, rugRaw] = await Promise.all([
    unionPngMasks(classes.floor ?? [], width, height),
    unionPngMasks(classes.wall ?? [], width, height),
    unionPngMasks(classes.ceiling ?? [], width, height),
    unionPngMasks(classes.rug ?? [], width, height),
  ])
  let { floor, wall } = combineRoomMasks({
    floor: floorRaw,
    wall: wallRaw,
    ceiling: ceilingRaw,
    rug: rugRaw,
    width,
    height,
  })
  const notes = [payload.note ?? null]
  const floorCheck = assessSurfaceMask(floor)
  const wallCheck = assessSurfaceMask(wall)
  if (status.sam.configured && floorCheck.failed) {
    try {
      floor = combineRoomMasks({
        floor: await samMask(canvas, "FLOOR", width, height),
        wall: new Uint8Array(width * height),
        ceiling: new Uint8Array(width * height),
        rug: new Uint8Array(width * height),
        width,
        height,
      }).floor
      notes.push(`Piso: ${floorCheck.reason} Grounded SAM (${status.sam.model}) refez a máscara.`)
    } catch (error) {
      notes.push(
        `Piso: ${floorCheck.reason} Grounded SAM falhou (${error instanceof Error ? error.message : "erro"}).`,
      )
    }
  }
  if (status.sam.configured && wallCheck.failed) {
    try {
      wall = combineRoomMasks({
        floor,
        wall: await samMask(canvas, "WALL", width, height),
        ceiling: ceilingRaw,
        rug: new Uint8Array(width * height),
        width,
        height,
      }).wall
      notes.push(`Parede: ${wallCheck.reason} Grounded SAM (${status.sam.model}) refez a máscara.`)
    } catch (error) {
      notes.push(
        `Parede: ${wallCheck.reason} Grounded SAM falhou (${error instanceof Error ? error.message : "erro"}).`,
      )
    }
  }
  if (maskCoverage(wall) < 0.03) {
    wall = fallbackWallMask(floor, width, height)
    notes.push(
      "Parede: o modelo não marcou parede. A faixa acima do piso usa o recorte geométrico, não o SegFormer.",
    )
  }

  let depth: Float32Array | null = null
  if (payload.depthPngBase64) {
    const decoded = await pngBase64ToDepth(payload.depthPngBase64, width, height)
    let min = 1
    let max = 0
    for (const value of decoded) {
      if (value < min) min = value
      if (value > max) max = value
    }
    depth = max - min > 0.08 ? decoded : null
  }

  return {
    floor,
    wall,
    depth,
    depthModel: depth ? (payload.depthModel ?? status.depth.model) : null,
    source: {
      provider: payload.provider || status.segmentation.provider,
      model: payload.model || status.segmentation.model,
      configured: true,
      note: notes.filter((note): note is string => Boolean(note)).join(" ") || null,
    },
    status,
  }
}

export type PreviewRun = {
  blob: Blob
  provider: string
  model: string
  processingMs: number
  estimatedCostBrl: number
  technicalPrompt: string
  polishNote: string | null
}

async function blendPolish(base: HTMLCanvasElement, polished: Blob, band: Uint8Array): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(polished)
  const canvas = document.createElement("canvas")
  canvas.width = base.width
  canvas.height = base.height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error("Não foi possível aplicar o polimento.")
  }
  context.drawImage(base, 0, 0)
  const baseImage = context.getImageData(0, 0, canvas.width, canvas.height)
  const layer = document.createElement("canvas")
  layer.width = canvas.width
  layer.height = canvas.height
  const layerContext = layer.getContext("2d", { willReadFrequently: true })
  if (!layerContext) {
    bitmap.close()
    throw new Error("Não foi possível ler o Flux Fill.")
  }
  layerContext.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const flux = layerContext.getImageData(0, 0, canvas.width, canvas.height)
  const feather = boxBlurMask(band, canvas.width, canvas.height, 2)
  for (let index = 0; index < band.length; index++) {
    const amount = feather[index] ?? 0
    if (amount === 0) continue
    const offset = index * 4
    const keep = 255 - amount
    baseImage.data[offset] = Math.round(
      ((baseImage.data[offset] ?? 0) * keep + (flux.data[offset] ?? 0) * amount) / 255,
    )
    baseImage.data[offset + 1] = Math.round(
      ((baseImage.data[offset + 1] ?? 0) * keep + (flux.data[offset + 1] ?? 0) * amount) / 255,
    )
    baseImage.data[offset + 2] = Math.round(
      ((baseImage.data[offset + 2] ?? 0) * keep + (flux.data[offset + 2] ?? 0) * amount) / 255,
    )
    baseImage.data[offset + 3] = 255
  }
  context.putImageData(baseImage, 0, 0)
  return canvas
}

export async function renderPreview(options: {
  source: HTMLCanvasElement
  mask: Uint8Array
  product: CatalogProduct
  depth: Float32Array | null
  segmentationProvider: string
  segmentationModel: string
  onPhase?: (phase: string) => void
}): Promise<PreviewRun> {
  const started = performance.now()
  options.onPhase?.("Aplicando a textura do catálogo em perspectiva…")
  const composited = await compositeMaterial({
    source: options.source,
    mask: options.mask,
    textureUrl: options.product.textureUrl,
    tileScale: options.product.tileScale,
    textureAxis: options.product.textureAxis,
    surface: options.product.surface,
    depth: options.depth,
  })
  const prompt = buildFluxPolishPrompt({
    name: options.product.name,
    finish: options.product.finish,
    dimensions: options.product.dimensions,
    surface: options.product.surface,
  })
  const status = await fetchPipelineStatus()
  let canvas = composited.canvas
  let polishProvider = "unconfigured"
  let polishModel = "none"
  let polishNote: string | null = status.polish.configured
    ? null
    : "Flux Fill não configurado. A prévia é a textura em perspectiva, sem polimento."
  const bandCoverage = maskCoverage(composited.edgeBand)
  if (status.reachable && status.polish.configured && bandCoverage > 0.002) {
    options.onPhase?.(`Polindo emendas com ${status.polish.model}…`)
    const scaled = scaleCanvas(composited.canvas, 1400)
    const band =
      scaled === composited.canvas
        ? composited.edgeBand
        : scaleBand(composited.edgeBand, composited.canvas.width, composited.canvas.height, scaled.width, scaled.height)
    const maskBlob = await maskToPng(band, scaled.width, scaled.height)
    try {
      const response = await fetch("/api/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: await canvasToBase64(scaled, "image/jpeg", 0.9),
          imageMime: "image/jpeg",
          maskPngBase64: await blobToBase64(maskBlob),
          surface: options.product.surface,
          prompt,
          productName: options.product.name,
          finish: options.product.finish,
          dimensions: options.product.dimensions,
        }),
        signal: AbortSignal.timeout(150_000),
      })
      const type = response.headers.get("content-type") ?? ""
      if (type.includes("application/json")) {
        const payload = (await response.json()) as { configured?: boolean; note?: string; error?: string }
        if (!response.ok) throw new Error(payload.error || "Flux Fill falhou.")
        polishNote = payload.note || "Flux Fill não rodou. A prévia mantém a textura composta."
      } else if (!response.ok) {
        throw new Error(`Flux Fill falhou (${response.status}).`)
      } else {
        const polished = await response.blob()
        canvas = await blendPolish(composited.canvas, polished, composited.edgeBand)
        polishProvider = response.headers.get("x-seenow-provider") || status.polish.provider
        polishModel = response.headers.get("x-seenow-model") || status.polish.model
        polishNote = null
      }
    } catch (error) {
      polishNote = error instanceof Error ? error.message : "Flux Fill falhou. A prévia mantém a textura composta."
    }
  } else if (status.polish.configured && bandCoverage <= 0.002) {
    polishNote = "A faixa de emenda ficou vazia. Flux Fill não rodou; a textura composta permanece."
  }

  const provider =
    polishProvider === "unconfigured" ? options.segmentationProvider : `${options.segmentationProvider}+${polishProvider}`
  const model =
    polishProvider === "unconfigured"
      ? `${options.segmentationModel} · ${PERSPECTIVE_WARP_MODEL}`
      : `${options.segmentationModel} · ${PERSPECTIVE_WARP_MODEL} · ${polishModel}`
  return {
    blob: await canvasToBlob(canvas, "image/jpeg", 0.92),
    provider,
    model,
    processingMs: Math.round(performance.now() - started),
    estimatedCostBrl: estimatePipelineCostBrl(options.segmentationProvider, polishProvider),
    technicalPrompt: prompt,
    polishNote,
  }
}

function scaleBand(mask: Uint8Array, width: number, height: number, targetWidth: number, targetHeight: number): Uint8Array {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return mask
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
  const scaled = document.createElement("canvas")
  scaled.width = targetWidth
  scaled.height = targetHeight
  const scaledContext = scaled.getContext("2d", { willReadFrequently: true })
  if (!scaledContext) return mask
  scaledContext.imageSmoothingEnabled = true
  scaledContext.drawImage(canvas, 0, 0, targetWidth, targetHeight)
  const pixels = scaledContext.getImageData(0, 0, targetWidth, targetHeight)
  const out = new Uint8Array(targetWidth * targetHeight)
  for (let index = 0; index < out.length; index++) out[index] = (pixels.data[index * 4] ?? 0) >= 128 ? 255 : 0
  return out
}

export function usePipelineStatus(): ClientPipelineStatus | null {
  const [status, setStatus] = useState<ClientPipelineStatus | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetchPipelineStatus().then((next) => {
      if (!cancelled) setStatus(next)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return status
}
