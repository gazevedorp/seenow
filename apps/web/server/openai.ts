import { encodeOpenAiMaskPng } from "./png.ts"
import { maskCoverage, polygonsFromJson, rasterizePolygons } from "./raster.ts"
import type { SegmentSurface } from "./parse-segment.ts"
import { ProviderRequestError, httpFailure } from "./retry.ts"

const ATTEMPT_MS = 45_000

function dataUri(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`
}

function parseModelJson(text: string): unknown {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) throw new ProviderRequestError("A OpenAI não devolveu um contorno.", 502, true)
  return JSON.parse(text.slice(start, end + 1)) as unknown
}

export async function openaiSegmentMask(
  apiKey: string,
  model: string,
  imageBase64: string,
  mime: string,
  surface: SegmentSurface,
  width: number,
  height: number,
): Promise<{ mask: Uint8Array; width: number; height: number }> {
  const target = surface === "FLOOR" ? "floor" : "wall"
  const exclude =
    surface === "FLOOR"
      ? "Exclude walls, ceiling, furniture, people, plants, rugs and windows."
      : "Exclude floor, ceiling, windows, doors, paintings, furniture and people."
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(ATTEMPT_MS),
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Segment the ${target} in this indoor photo. ${exclude} Return JSON {"polygons":[[[x,y],...]]}. Coordinates are normalized from 0 to 1, origin at the top-left. Use one or more polygons with at least 4 points each.`,
            },
            { type: "image_url", image_url: { url: dataUri(mime, imageBase64) } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) throw httpFailure(response.status, `OpenAI recusou a segmentação (${response.status}).`)
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = body.choices?.[0]?.message?.content ?? ""
  const polygons = polygonsFromJson(parseModelJson(content))
  const longEdge = Math.max(width, height)
  const scale = Math.min(1, 512 / Math.max(1, longEdge))
  const rasterWidth = Math.max(8, Math.round(width * scale))
  const rasterHeight = Math.max(8, Math.round(height * scale))
  const mask = rasterizePolygons(polygons, rasterWidth, rasterHeight)
  if (polygons.length === 0 || maskCoverage(mask) < 0.02) {
    throw new ProviderRequestError("O contorno da OpenAI ficou vazio.", 422, false)
  }
  return { mask, width: rasterWidth, height: rasterHeight }
}

export function outputSize(width: number, height: number): "1536x1024" | "1024x1536" | "1024x1024" {
  const ratio = width / Math.max(1, height)
  if (ratio > 1.15) return "1536x1024"
  if (ratio < 0.87) return "1024x1536"
  return "1024x1024"
}

function multipart(parts: Array<{ name: string; filename?: string; contentType: string; value: Buffer | string }>): {
  body: Buffer
  boundary: string
} {
  const boundary = `----seenow${Math.random().toString(16).slice(2)}`
  const chunks: Buffer[] = []
  for (const part of parts) {
    const disposition = part.filename
      ? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`
      : `Content-Disposition: form-data; name="${part.name}"`
    chunks.push(Buffer.from(`--${boundary}\r\n${disposition}\r\nContent-Type: ${part.contentType}\r\n\r\n`))
    chunks.push(typeof part.value === "string" ? Buffer.from(part.value) : part.value)
    chunks.push(Buffer.from("\r\n"))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(chunks), boundary }
}

export async function openaiInpaint(options: {
  apiKey: string
  model: string
  quality: string
  prompt: string
  image: Buffer
  imageMime: string
  mask: Uint8Array
  width: number
  height: number
}): Promise<Buffer> {
  const maskPng = encodeOpenAiMaskPng(options.mask, options.width, options.height)
  const form = multipart([
    { name: "model", contentType: "text/plain", value: options.model },
    { name: "prompt", contentType: "text/plain", value: options.prompt.slice(0, 4000) },
    { name: "size", contentType: "text/plain", value: outputSize(options.width, options.height) },
    { name: "quality", contentType: "text/plain", value: options.quality },
    { name: "output_format", contentType: "text/plain", value: "jpeg" },
    {
      name: "image",
      filename: "ambiente.jpg",
      contentType: options.imageMime || "image/jpeg",
      value: options.image,
    },
    { name: "mask", filename: "mascara.png", contentType: "image/png", value: maskPng },
  ])
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${form.boundary}`,
    },
    body: new Uint8Array(form.body),
    signal: AbortSignal.timeout(ATTEMPT_MS),
  })
  if (!response.ok) throw httpFailure(response.status, `OpenAI recusou a edição (${response.status}).`)
  const body = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
  const first = body.data?.[0]
  if (first?.b64_json) return Buffer.from(first.b64_json, "base64")
  if (first?.url) {
    const download = await fetch(first.url, { signal: AbortSignal.timeout(20_000) })
    if (!download.ok) throw httpFailure(download.status, "Não foi possível baixar a edição da OpenAI.")
    return Buffer.from(await download.arrayBuffer())
  }
  throw new ProviderRequestError("A OpenAI não devolveu imagem.", 502, true)
}
