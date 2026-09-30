import type { SegmentSurface } from "./parse-segment.ts"
import { isGroundedModel, selectMaskUrls } from "./parse-segment.ts"
import { ProviderRequestError, httpFailure } from "./retry.ts"

const ATTEMPT_MS = 45_000

type Prediction = {
  id?: string
  status?: string
  output?: unknown
  error?: unknown
  urls?: { get?: string }
}

export async function replicatePredict(token: string, model: string, input: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=45",
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(ATTEMPT_MS),
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
    throw new ProviderRequestError("O modelo no Replicate não concluiu.", 502, true)
  }
  return body.output
}

export function segmentInput(model: string, dataUri: string, surface: SegmentSurface): Record<string, unknown> {
  if (isGroundedModel(model)) {
    return {
      image: dataUri,
      mask_prompt: surface === "FLOOR" ? "floor" : "wall",
      negative_mask_prompt:
        surface === "FLOOR"
          ? "wall, ceiling, furniture, sofa, chair, table, person, plant, rug, window, door"
          : "floor, ceiling, window, door, furniture, sofa, person, painting, picture",
      adjustment_factor: -1,
    }
  }
  return { image: dataUri }
}

export async function replicateMaskPngs(
  token: string,
  model: string,
  dataUri: string,
  surface: SegmentSurface,
): Promise<string[]> {
  const output = await replicatePredict(token, model, segmentInput(model, dataUri, surface))
  const urls = selectMaskUrls(output, surface, model)
  if (urls.length === 0) {
    throw new ProviderRequestError("O modelo não devolveu máscara de piso ou parede.", 422, false)
  }
  const encoded: string[] = []
  for (const url of urls) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw httpFailure(response.status, "Não foi possível baixar a máscara.")
    const bytes = Buffer.from(await response.arrayBuffer())
    encoded.push(bytes.toString("base64"))
  }
  return encoded
}

export async function replicateInpaint(
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
  const url = typeof output === "string" ? output : Array.isArray(output) && typeof output[0] === "string" ? output[0] : ""
  if (!url) throw new ProviderRequestError("O inpainting não devolveu imagem.", 502, true)
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw httpFailure(response.status, "Não foi possível baixar a imagem gerada.")
  return Buffer.from(await response.arrayBuffer())
}
