import type { IncomingMessage, ServerResponse } from "node:http"
import {
  buildFluxPolishPrompt,
  estimatePipelineCostBrl,
  type PremiumPublicStatus,
  type Surface,
} from "../../../packages/shared/src/index.ts"
import type { PipelineSecrets } from "./env.ts"
import { falFluxFill } from "./fal.ts"
import { asImageDataUri, imagePayloadBase64, sniffImageMime } from "./image-uri.ts"
import { hasRoomClass, hfDepth, hfSegment, type ClassMasks } from "./hf.ts"
import { replicateFluxFill, replicateGroundedSam, replicateSegformer } from "./replicate.ts"
import { ProviderRequestError, withRetry } from "./retry.ts"

const MAX_BODY = 22_000_000

type PipelineContext = {
  plan: PremiumPublicStatus
  secrets: PipelineSecrets
  hfSegmentModel: string
  hfSegmentFallbackModel: string
}

type ImageBody = {
  imageBase64?: string
  imageMime?: string
  surface?: string
  maskPngBase64?: string
  prompt?: string
  productName?: string
  finish?: string
  dimensions?: string
}

export function createPipelineMiddleware(getContext: () => PipelineContext) {
  return (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const path = (req.url ?? "").split("?")[0] ?? ""
    if (!path.startsWith("/api/")) {
      next()
      return
    }
    void dispatch(req, res, path, getContext()).catch((error: unknown) => {
      if (res.headersSent) return
      const message = error instanceof Error ? error.message : "Falha interna."
      const status = error instanceof ProviderRequestError ? error.status : 500
      sendJson(res, status, { error: message, configured: true })
    })
  }
}

async function dispatch(req: IncomingMessage, res: ServerResponse, path: string, context: PipelineContext) {
  if (req.method === "GET" && path === "/api/pipeline-status") {
    sendJson(res, 200, context.plan)
    return
  }
  if (req.method === "POST" && path === "/api/segment") {
    await handleSegment(req, res, context)
    return
  }
  if (req.method === "POST" && path === "/api/segment-sam") {
    await handleSam(req, res, context)
    return
  }
  if (req.method === "POST" && path === "/api/polish") {
    await handlePolish(req, res, context)
    return
  }
  sendJson(res, 404, { error: "Caminho não encontrado." })
}

async function handleSegment(req: IncomingMessage, res: ServerResponse, context: PipelineContext) {
  const body = (await readJson(req)) as ImageBody
  const image = decodeImage(body)
  const plan = context.plan.segmentation
  if (!plan.configured) {
    sendJson(res, 200, {
      configured: false,
      provider: "unconfigured",
      model: "none",
      classes: { floor: [], wall: [], ceiling: [], rug: [] },
      depthPngBase64: null,
      depthModel: null,
      note: "Defina HF_TOKEN ou REPLICATE_API_TOKEN. Este caminho não usa heurística de cor.",
    })
    return
  }
  const started = Date.now()
  const depthPromise =
    context.plan.depth.configured && context.secrets.hfToken
      ? hfDepth(context.secrets.hfToken, context.plan.depth.model, image.bytes, image.mime).catch(() => null)
      : Promise.resolve(null)

  let classes: ClassMasks
  let model = plan.model
  let note: string | null = null
  if (plan.provider === "huggingface") {
    const primary = await runHfSegment(context, image.bytes, image.mime)
    classes = primary.classes
    model = primary.model
    note = primary.note
  } else {
    const outcome = await withRetry(
      () => replicateSegformer(context.secrets.replicateToken, plan.model, asImageDataUri(image.base64, image.mime)),
      2,
    )
    classes = outcome.value
  }
  if (!hasRoomClass(classes)) {
    throw new ProviderRequestError("O SegFormer não marcou piso nem parede.", 422, false)
  }
  const depthPngBase64 = await depthPromise
  sendJson(res, 200, {
    configured: true,
    provider: plan.provider,
    model,
    classes,
    depthPngBase64,
    depthModel: depthPngBase64 ? context.plan.depth.model : null,
    processingMs: Date.now() - started,
    note,
  })
}

async function runHfSegment(
  context: PipelineContext,
  image: Buffer,
  mime: string,
): Promise<{ classes: ClassMasks; model: string; note: string | null }> {
  const primary = context.hfSegmentModel
  try {
    const outcome = await withRetry(() => hfSegment(context.secrets.hfToken, primary, image, mime), 2)
    return { classes: outcome.value, model: primary, note: null }
  } catch (error) {
    const fallback = context.hfSegmentFallbackModel
    if (!fallback || fallback === primary) throw error
    const outcome = await withRetry(() => hfSegment(context.secrets.hfToken, fallback, image, mime), 1)
    return {
      classes: outcome.value,
      model: fallback,
      note: `O modelo ${primary} falhou. A máscara saiu de ${fallback}.`,
    }
  }
}

async function handleSam(req: IncomingMessage, res: ServerResponse, context: PipelineContext) {
  const body = (await readJson(req)) as ImageBody
  const surface = parseSurface(body.surface)
  const image = decodeImage(body)
  if (!surface) {
    sendJson(res, 400, { error: "Informe a superfície.", configured: context.plan.sam.configured })
    return
  }
  if (!context.plan.sam.configured) {
    sendJson(res, 409, {
      error: "Grounded SAM só entra com REPLICATE_API_TOKEN e SegFormer configurado.",
      configured: false,
    })
    return
  }
  const started = Date.now()
  const outcome = await withRetry(
    () =>
      replicateGroundedSam(
        context.secrets.replicateToken,
        context.plan.sam.model,
        asImageDataUri(image.base64, image.mime),
        surface,
      ),
    2,
  )
  sendJson(res, 200, {
    configured: true,
    provider: "replicate",
    model: context.plan.sam.model,
    pngBase64: outcome.value,
    surface,
    processingMs: Date.now() - started,
    retryCount: outcome.retryCount,
  })
}

async function handlePolish(req: IncomingMessage, res: ServerResponse, context: PipelineContext) {
  const body = (await readJson(req)) as ImageBody
  const image = decodeImage(body)
  const mask = body.maskPngBase64?.trim() ?? ""
  const surface = parseSurface(body.surface)
  if (!mask || !surface) {
    sendJson(res, 400, { error: "Envie a foto composta e a faixa da máscara." })
    return
  }
  const polish = context.plan.polish
  if (!polish.configured) {
    sendJson(res, 200, {
      configured: false,
      provider: "unconfigured",
      model: "none",
      note: "Flux Fill não rodou. Defina FAL_KEY ou REPLICATE_API_TOKEN. A prévia fica na textura composta.",
    })
    return
  }
  const prompt =
    body.prompt?.trim() ||
    buildFluxPolishPrompt({
      name: body.productName?.trim() || "catalog material",
      finish: body.finish,
      dimensions: body.dimensions,
      surface,
    })
  const started = Date.now()
  const imageUri = asImageDataUri(image.base64, image.mime)
  const maskUri = asImageDataUri(mask, "image/png")
  const outcome = await withRetry(async () => {
    if (polish.provider === "fal") {
      return falFluxFill(context.secrets.falKey, polish.model, imageUri, maskUri, prompt)
    }
    return replicateFluxFill(context.secrets.replicateToken, polish.model, imageUri, maskUri, prompt)
  }, 2)
  const bytes = outcome.value
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50
  res.statusCode = 200
  res.setHeader("content-type", png ? "image/png" : "image/jpeg")
  res.setHeader("cache-control", "no-store")
  res.setHeader("x-seenow-provider", polish.provider)
  res.setHeader("x-seenow-model", polish.model)
  res.setHeader("x-seenow-cost-brl", String(estimatePipelineCostBrl(context.plan.segmentation.provider, polish.provider)))
  res.setHeader("x-seenow-ms", String(Date.now() - started))
  res.setHeader("x-seenow-retries", String(outcome.retryCount))
  res.end(bytes)
}

function parseSurface(value: string | undefined): Surface | null {
  if (value === "FLOOR" || value === "WALL") return value
  return null
}

function decodeImage(body: ImageBody): { bytes: Buffer; base64: string; mime: string } {
  const raw = body.imageBase64?.trim() ?? ""
  if (!raw) throw new ProviderRequestError("Envie a foto do ambiente.", 400, false)
  const base64 = imagePayloadBase64(raw) ?? raw.replace(/\s/g, "")
  const mime = sniffImageMime(base64) ?? (body.imageMime?.trim() || "image/jpeg")
  return { bytes: Buffer.from(base64, "base64"), base64, mime }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY) throw new ProviderRequestError("A imagem passou do limite deste passo.", 413, false)
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    throw new ProviderRequestError("Não foi possível ler o pedido.", 400, false)
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("cache-control", "no-store")
  res.end(JSON.stringify(body))
}
