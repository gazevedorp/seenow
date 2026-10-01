import { adeClassBucket, type Surface } from "../../../packages/shared/src/index.ts"
import type { ClassMasks } from "./hf.ts"
import { asImageDataUri, imagePayloadBase64 } from "./image-uri.ts"
import { ProviderRequestError, httpFailure } from "./retry.ts"

const ATTEMPT_MS = 110_000
const VERSION_HASH = /^[0-9a-f]{64}$/i

const versionCache = new Map<string, string>()

type Prediction = {
  id?: string
  status?: string
  output?: unknown
  error?: unknown
  urls?: { get?: string }
}

type VersionRow = {
  id?: string
  created_at?: string
}

export function clearReplicateVersionCache(): void {
  versionCache.clear()
}

function modelSlug(model: string): string {
  const trimmed = model.trim()
  const colon = trimmed.lastIndexOf(":")
  if (colon > 0 && VERSION_HASH.test(trimmed.slice(colon + 1)) && trimmed.includes("/")) {
    return trimmed.slice(0, colon)
  }
  return trimmed
}

function pinnedVersion(model: string): string | null {
  const trimmed = model.trim()
  if (VERSION_HASH.test(trimmed)) return trimmed
  const colon = trimmed.lastIndexOf(":")
  if (colon > 0 && trimmed.includes("/") && VERSION_HASH.test(trimmed.slice(colon + 1))) return trimmed
  return null
}

async function errorDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text()
    if (!text) return null
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown; title?: unknown }
      const detail = [parsed.detail, parsed.error, parsed.title].find((value) => typeof value === "string" && value.length > 0)
      if (typeof detail === "string") return detail.slice(0, 300)
    } catch {
      return text.slice(0, 300)
    }
    return null
  } catch {
    return null
  }
}

function missingModel(slug: string, version: string, status: number, detail: string | null): ProviderRequestError {
  const extra = detail ? ` ${detail}` : ""
  return new ProviderRequestError(`Replicate não encontrou o modelo ${slug} (versão ${version}).${extra}`, status, false)
}

function newestVersionId(rows: VersionRow[]): string | null {
  const usable = rows.filter((row): row is VersionRow & { id: string } => typeof row.id === "string" && VERSION_HASH.test(row.id))
  if (usable.length === 0) return null
  let best = usable[0]
  let bestTime = Date.parse(best.created_at ?? "")
  for (const row of usable.slice(1)) {
    const time = Date.parse(row.created_at ?? "")
    if (Number.isNaN(time)) continue
    if (Number.isNaN(bestTime) || time > bestTime) {
      best = row
      bestTime = time
    }
  }
  return best.id
}

async function resolvePredictionVersion(token: string, model: string): Promise<string> {
  const pinned = pinnedVersion(model)
  if (pinned) return pinned
  const slug = modelSlug(model)
  const cached = versionCache.get(slug)
  if (cached) return cached

  const [owner, name, ...rest] = slug.split("/")
  if (!owner || !name || rest.length > 0) {
    throw new ProviderRequestError(`Replicate não encontrou o modelo ${slug}.`, 404, false)
  }
  const response = await fetch(
    `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/versions`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!response.ok) {
    const detail = await errorDetail(response)
    if (response.status === 404) return slug
    if (response.status === 422) throw missingModel(slug, slug, response.status, detail)
    throw httpFailure(
      response.status,
      `Replicate não listou versões de ${slug} (${response.status}).${detail ? ` ${detail}` : ""}`,
    )
  }
  const body = (await response.json()) as { results?: VersionRow[] }
  const versionId = newestVersionId(Array.isArray(body.results) ? body.results : [])
  if (!versionId) {
    versionCache.set(slug, slug)
    return slug
  }
  const version = `${slug}:${versionId}`
  versionCache.set(slug, version)
  return version
}

function fileRef(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  if (value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string") {
    const url = (value as { url: string }).url.trim()
    return url.length > 0 ? url : null
  }
  return null
}

async function readImageBase64(value: unknown): Promise<string> {
  const ref = fileRef(value)
  if (!ref) throw new ProviderRequestError("A imagem devolvida pelo modelo está vazia.", 502, true)
  const inline = imagePayloadBase64(ref)
  if (inline) return inline
  if (!/^https?:\/\//i.test(ref)) {
    throw new ProviderRequestError("A imagem devolvida pelo modelo não é uma URL nem um data URI.", 502, false)
  }
  const response = await fetch(ref, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw httpFailure(response.status, "Não foi possível baixar a imagem do modelo.")
  return Buffer.from(await response.arrayBuffer()).toString("base64")
}

export async function replicatePredict(token: string, model: string, input: Record<string, unknown>): Promise<unknown> {
  const slug = modelSlug(model)
  const version = await resolvePredictionVersion(token, model)
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({ version, input }),
    signal: AbortSignal.timeout(70_000),
  })
  if (!response.ok) {
    const detail = await errorDetail(response)
    if (response.status === 404 || response.status === 422) throw missingModel(slug, version, response.status, detail)
    throw httpFailure(response.status, `Replicate recusou a chamada de ${slug} (${response.status}).${detail ? ` ${detail}` : ""}`)
  }
  if (version === slug) versionCache.set(slug, slug)
  let body = (await response.json()) as Prediction
  const started = Date.now()
  while (body.status === "starting" || body.status === "processing") {
    if (Date.now() - started > ATTEMPT_MS) {
      throw new ProviderRequestError("Replicate excedeu o tempo da tentativa.", 504, true)
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const pollUrl = body.urls?.get ?? `https://api.replicate.com/v1/predictions/${body.id ?? ""}`
    const poll = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!poll.ok) throw httpFailure(poll.status, `Replicate não devolveu o status (${poll.status}).`)
    body = (await poll.json()) as Prediction
  }
  if (body.status !== "succeeded") {
    const detail = typeof body.error === "string" ? body.error : "O modelo no Replicate não concluiu."
    throw new ProviderRequestError(detail, 502, true)
  }
  return body.output
}

export async function replicateSegformer(token: string, model: string, dataUri: string): Promise<ClassMasks> {
  const output = await replicatePredict(token, model, { image: asImageDataUri(dataUri, "image/jpeg") })
  const grouped: ClassMasks = { floor: [], wall: [], ceiling: [], rug: [] }
  if (!Array.isArray(output)) {
    throw new ProviderRequestError("O SegFormer no Replicate não devolveu classes.", 502, true)
  }
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const record = item as { label?: unknown; mask?: unknown }
    if (typeof record.label !== "string") continue
    if (record.mask == null || record.mask === "") continue
    const bucket = adeClassBucket(record.label)
    const name = record.label.trim().toLowerCase()
    const encoded = await readImageBase64(record.mask)
    if (name === "rug") grouped.rug.push(encoded)
    else if (bucket === "floor") grouped.floor.push(encoded)
    else if (bucket === "wall") grouped.wall.push(encoded)
    else if (bucket === "ceiling") grouped.ceiling.push(encoded)
  }
  if (grouped.floor.length + grouped.rug.length + grouped.wall.length === 0) {
    throw new ProviderRequestError("O SegFormer no Replicate não marcou piso nem parede.", 422, false)
  }
  return grouped
}

export async function replicateGroundedSam(
  token: string,
  model: string,
  dataUri: string,
  surface: Surface,
): Promise<string> {
  const output = await replicatePredict(token, model, {
    image: asImageDataUri(dataUri, "image/jpeg"),
    mask_prompt: surface === "FLOOR" ? "floor" : "wall",
    negative_mask_prompt:
      surface === "FLOOR"
        ? "wall, ceiling, furniture, sofa, chair, table, person, plant, window, door"
        : "floor, ceiling, window, door, furniture, sofa, person, painting",
    adjustment_factor: -1,
  })
  const items = Array.isArray(output) ? output : [output]
  const maskRef = items[2] ?? items[0]
  if (maskRef == null || maskRef === "") throw new ProviderRequestError("O Grounded SAM não devolveu máscara.", 502, true)
  return readImageBase64(maskRef)
}

export async function replicateFluxFill(
  token: string,
  model: string,
  imageUri: string,
  maskUri: string,
  prompt: string,
): Promise<Buffer> {
  const output = await replicatePredict(token, model, {
    prompt: prompt.slice(0, 4000),
    image: asImageDataUri(imageUri, "image/jpeg"),
    mask: asImageDataUri(maskUri, "image/png"),
    output_format: "jpg",
    steps: 28,
    prompt_upsampling: false,
    safety_tolerance: 2,
  })
  const image = Array.isArray(output) ? output[0] : output
  if (image == null || image === "") throw new ProviderRequestError("O Flux Fill não devolveu imagem.", 502, true)
  return Buffer.from(await readImageBase64(image), "base64")
}
