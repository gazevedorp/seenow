import { adeClassBucket } from "../../../packages/shared/src/index.ts"
import { ProviderRequestError, httpFailure } from "./retry.ts"

const HF_ROUTER = "https://router.huggingface.co/hf-inference/models"

type SegmentItem = { label?: unknown; mask?: unknown }

export type ClassMasks = {
  floor: string[]
  wall: string[]
  ceiling: string[]
  rug: string[]
}

function emptyClasses(): ClassMasks {
  return { floor: [], wall: [], ceiling: [], rug: [] }
}

function maskBase64(value: string): string {
  const trimmed = value.trim()
  const payload = trimmed.startsWith("data:") ? trimmed.slice(trimmed.indexOf(",") + 1) : trimmed
  return payload.replace(/\s/g, "")
}

export function groupSegmentItems(payload: unknown): ClassMasks {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError("A segmentação não devolveu máscaras.", 502, true)
  }
  const grouped = emptyClasses()
  for (const item of payload) {
    if (!item || typeof item !== "object") continue
    const record = item as SegmentItem
    if (typeof record.label !== "string" || typeof record.mask !== "string") continue
    const bucket = adeClassBucket(record.label)
    const encoded = maskBase64(record.mask)
    if (!encoded) continue
    if (bucket === "floor" && record.label.trim().toLowerCase() === "rug") grouped.rug.push(encoded)
    else if (bucket === "floor") grouped.floor.push(encoded)
    else if (bucket === "wall") grouped.wall.push(encoded)
    else if (bucket === "ceiling") grouped.ceiling.push(encoded)
  }
  return grouped
}

export function hasRoomClass(classes: ClassMasks): boolean {
  return classes.floor.length + classes.rug.length + classes.wall.length > 0
}

async function readError(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.slice(0, 280) || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export async function hfSegment(token: string, model: string, image: Buffer, mime: string): Promise<ClassMasks> {
  const response = await fetch(`${HF_ROUTER}/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mime,
      Accept: "application/json",
    },
    body: new Uint8Array(image),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) {
    const detail = await readError(response)
    throw httpFailure(response.status, `Hugging Face recusou o SegFormer (${response.status}). ${detail}`)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ProviderRequestError("A resposta do SegFormer não é JSON.", 502, true)
  }
  if (payload && typeof payload === "object" && "error" in payload) {
    const message = String((payload as { error?: unknown }).error ?? "erro")
    const loading = /loading/i.test(message)
    throw new ProviderRequestError(`SegFormer: ${message}`, loading ? 503 : 502, true)
  }
  const grouped = groupSegmentItems(payload)
  if (!hasRoomClass(grouped)) {
    throw new ProviderRequestError("O SegFormer não marcou piso nem parede.", 422, false)
  }
  return grouped
}

export async function hfDepth(token: string, model: string, image: Buffer, mime: string): Promise<string | null> {
  const response = await fetch(`${HF_ROUTER}/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mime,
      Accept: "image/png, application/json",
    },
    body: new Uint8Array(image),
    signal: AbortSignal.timeout(70_000),
  })
  if (!response.ok) return null
  const type = response.headers.get("content-type") ?? ""
  if (type.includes("application/json")) {
    const payload = (await response.json()) as { image?: unknown; blob?: unknown } | unknown[]
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const imageField = payload.image ?? payload.blob
      if (typeof imageField === "string") return maskBase64(imageField)
    }
    return null
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 32) return null
  return bytes.toString("base64")
}
