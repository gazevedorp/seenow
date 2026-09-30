import type { IncomingMessage, ServerResponse } from "node:http"
import { estimatedCostBrl, resolveInpainting, resolveSegmentation, type ServerAiEnv } from "./env.ts"
import { encodeGrayPng, encodeInpaintMaskPng } from "./png.ts"
import { openaiInpaint, openaiSegmentMask } from "./openai.ts"
import type { SegmentSurface } from "./parse-segment.ts"
import { ProviderRequestError, withRetry } from "./retry.ts"
import { replicateInpaint, replicateMaskPngs } from "./replicate.ts"

const MAX_BODY = 18_000_000

type SegmentBody = {
  imageBase64?: string
  imageMime?: string
  width?: number
  height?: number
  surface?: string
}

type InpaintBody = SegmentBody & {
  maskBase64?: string
  technicalPrompt?: string
  provider?: string
  product?: {
    name?: string
    sku?: string
    category?: string
    brand?: string
    finish?: string
    hex?: string
    dimensions?: string
  }
}

export function createAiMiddleware(getEnv: () => ServerAiEnv) {
  return (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const path = (req.url ?? "").split("?")[0] ?? ""
    if (!path.startsWith("/api/")) {
      next()
      return
    }
    void dispatch(req, res, path, getEnv()).catch((error: unknown) => {
      if (res.headersSent) return
      if (error instanceof ProviderRequestError) {
        sendJson(res, error.status, { error: error.message, fallback: true })
        return
      }
      const message = error instanceof Error ? error.message : "Falha interna."
      sendJson(res, 500, { error: message, fallback: true })
    })
  }
}

async function dispatch(req: IncomingMessage, res: ServerResponse, path: string, env: ServerAiEnv) {
  if (req.method === "GET" && path === "/api/ai-status") {
    const segmentation = resolveSegmentation(env)
    const inpainting = resolveInpainting(env, env.inpaintingProvider)
    sendJson(res, 200, { segmentation, inpainting })
    return
  }
  if (req.method === "POST" && path === "/api/segment") {
    await handleSegment(req, res, env)
    return
  }
  if (req.method === "POST" && path === "/api/inpaint") {
    await handleInpaint(req, res, env)
    return
  }
  sendJson(res, 404, { error: "Caminho não encontrado.", fallback: true })
}

async function handleSegment(req: IncomingMessage, res: ServerResponse, env: ServerAiEnv) {
  const body = (await readJson(req)) as SegmentBody
  const surface = parseSurface(body.surface)
  const width = numberOrZero(body.width)
  const height = numberOrZero(body.height)
  if (!surface || !body.imageBase64 || width < 2 || height < 2) {
    sendJson(res, 400, { error: "Envie a foto e a superfície.", fallback: true })
    return
  }
  const resolved = resolveSegmentation(env)
  if (resolved.provider === "heuristic") {
    sendJson(res, 200, {
      provider: "heuristic",
      model: resolved.model,
      fallback: true,
      processingMs: 0,
      retryCount: 0,
      masks: [],
    })
    return
  }
  const started = Date.now()
  try {
    const attempts = 2
    if (resolved.provider === "replicate") {
      const outcome = await withRetry(
        () =>
          replicateMaskPngs(
            env.replicateToken,
            resolved.model,
            dataUri(body.imageMime || "image/jpeg", body.imageBase64 ?? ""),
            surface,
          ),
        attempts,
      )
      sendJson(res, 200, {
        provider: "replicate",
        model: resolved.model,
        fallback: false,
        processingMs: Date.now() - started,
        retryCount: outcome.retryCount,
        masks: outcome.value.map((pngBase64) => ({ label: surface === "FLOOR" ? "floor" : "wall", pngBase64 })),
      })
      return
    }
    const outcome = await withRetry(
      () =>
        openaiSegmentMask(
          env.openaiKey,
          resolved.model,
          body.imageBase64 ?? "",
          body.imageMime || "image/jpeg",
          surface,
          width,
          height,
        ),
      attempts,
    )
    sendJson(res, 200, {
      provider: "openai",
      model: resolved.model,
      fallback: false,
      processingMs: Date.now() - started,
      retryCount: outcome.retryCount,
      masks: [
        {
          label: surface === "FLOOR" ? "floor" : "wall",
          pngBase64: encodeGrayPng(outcome.value.mask, outcome.value.width, outcome.value.height).toString("base64"),
        },
      ],
    })
  } catch (error) {
    sendJson(res, 200, {
      provider: "heuristic",
      model: "room-color-region-v1",
      fallback: true,
      processingMs: Date.now() - started,
      retryCount: 0,
      masks: [],
      note: error instanceof Error ? error.message : "A segmentação remota falhou.",
    })
  }
}

async function handleInpaint(req: IncomingMessage, res: ServerResponse, env: ServerAiEnv) {
  const body = (await readJson(req)) as InpaintBody
  const surface = parseSurface(body.surface)
  const width = numberOrZero(body.width)
  const height = numberOrZero(body.height)
  const mask = body.maskBase64 ? Buffer.from(body.maskBase64, "base64") : Buffer.alloc(0)
  if (!surface || !body.imageBase64 || !body.technicalPrompt || width < 2 || height < 2 || mask.length !== width * height) {
    sendJson(res, 400, { error: "Foto, máscara e produto são obrigatórios.", fallback: true })
    return
  }
  const resolved = resolveInpainting(env, body.provider ?? "")
  if (resolved.provider === "mock") {
    sendJson(res, 200, {
      fallback: true,
      provider: "mock",
      model: resolved.model,
      note: "Sem chave de inpainting. A simulação local pinta só a região marcada.",
    })
    return
  }
  const started = Date.now()
  try {
    const image = Buffer.from(body.imageBase64, "base64")
    const prompt = buildPrompt(body, surface)
    const outcome = await withRetry(async () => {
      if (resolved.provider === "replicate") {
        return replicateInpaint(
          env.replicateToken,
          resolved.model,
          dataUri(body.imageMime || "image/jpeg", body.imageBase64 ?? ""),
          dataUri("image/png", encodeInpaintMaskPng(mask, width, height).toString("base64")),
          prompt,
        )
      }
      return openaiInpaint({
        apiKey: env.openaiKey,
        model: resolved.model,
        quality: env.openaiImageQuality,
        prompt,
        image,
        imageMime: body.imageMime || "image/jpeg",
        mask,
        width,
        height,
      })
    }, 3)
    const bytes = outcome.value
    const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50
    res.statusCode = 200
    res.setHeader("content-type", png ? "image/png" : "image/jpeg")
    res.setHeader("cache-control", "no-store")
    res.setHeader("x-seenow-provider", resolved.provider)
    res.setHeader("x-seenow-model", resolved.model)
    res.setHeader("x-seenow-cost-brl", String(estimatedCostBrl(resolved.provider, env.openaiImageQuality)))
    res.setHeader("x-seenow-ms", String(Date.now() - started))
    res.setHeader("x-seenow-retries", String(outcome.retryCount))
    res.end(bytes)
  } catch (error) {
    const message = error instanceof ProviderRequestError ? error.message : "A geração remota falhou."
    sendJson(res, 200, {
      fallback: true,
      provider: "mock",
      model: "local-composite-v1",
      note: message,
    })
  }
}

function buildPrompt(body: InpaintBody, surface: SegmentSurface): string {
  const product = body.product
  const bits = [
    body.technicalPrompt ?? "",
    product?.name ? `Product ${product.name}.` : "",
    product?.brand ? `Brand ${product.brand}.` : "",
    product?.finish ? `Finish ${product.finish}.` : "",
    product?.dimensions ? `Size ${product.dimensions}.` : "",
    product?.hex ? `Color ${product.hex}.` : "",
    `Change only the masked ${surface === "FLOOR" ? "floor" : "wall"}. Keep lighting, perspective, furniture, openings and people outside the mask.`,
  ]
  return bits.filter((part) => part.length > 0).join(" ")
}

function parseSurface(value: string | undefined): SegmentSurface | null {
  if (value === "FLOOR" || value === "WALL") return value
  return null
}

function numberOrZero(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function dataUri(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY) {
      throw new ProviderRequestError("A imagem passou do limite deste passo.", 413, false)
    }
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
