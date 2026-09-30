import { adeClassBucket, type Surface } from "../../../packages/shared/src/index.ts"
import type { ClassMasks } from "./hf.ts"
import { ProviderRequestError, httpFailure } from "./retry.ts"

const ATTEMPT_MS = 110_000

type Prediction = {
  id?: string
  status?: string
  output?: unknown
  error?: unknown
  urls?: { get?: string }
}

function asUrl(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value
  if (value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string") {
    return (value as { url: string }).url
  }
  return null
}

export async function replicatePredict(token: string, model: string, input: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(70_000),
  })
  if (!response.ok) {
    throw httpFailure(response.status, `Replicate recusou a chamada (${response.status}).`)
  }
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

async function downloadBase64(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) })
  if (!response.ok) throw httpFailure(response.status, "Não foi possível baixar a máscara.")
  return Buffer.from(await response.arrayBuffer()).toString("base64")
}

export async function replicateSegformer(token: string, model: string, dataUri: string): Promise<ClassMasks> {
  const output = await replicatePredict(token, model, { image: dataUri })
  const grouped: ClassMasks = { floor: [], wall: [], ceiling: [], rug: [] }
  if (!Array.isArray(output)) {
    throw new ProviderRequestError("O SegFormer no Replicate não devolveu classes.", 502, true)
  }
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const record = item as { label?: unknown; mask?: unknown }
    if (typeof record.label !== "string") continue
    const url = asUrl(record.mask)
    if (!url) continue
    const bucket = adeClassBucket(record.label)
    const name = record.label.trim().toLowerCase()
    const encoded = await downloadBase64(url)
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
    image: dataUri,
    mask_prompt: surface === "FLOOR" ? "floor" : "wall",
    negative_mask_prompt:
      surface === "FLOOR"
        ? "wall, ceiling, furniture, sofa, chair, table, person, plant, window, door"
        : "floor, ceiling, window, door, furniture, sofa, person, painting",
    adjustment_factor: -1,
  })
  const urls = Array.isArray(output) ? output.map(asUrl).filter((url): url is string => Boolean(url)) : []
  const maskUrl = urls[2] ?? urls[0]
  if (!maskUrl) throw new ProviderRequestError("O Grounded SAM não devolveu máscara.", 502, true)
  return downloadBase64(maskUrl)
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
    image: imageUri,
    mask: maskUri,
    output_format: "jpg",
    steps: 28,
    prompt_upsampling: false,
    safety_tolerance: 2,
  })
  const url = asUrl(output) ?? (Array.isArray(output) ? asUrl(output[0]) : null)
  if (!url) throw new ProviderRequestError("O Flux Fill não devolveu imagem.", 502, true)
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw httpFailure(response.status, "Não foi possível baixar o polimento.")
  return Buffer.from(await response.arrayBuffer())
}
