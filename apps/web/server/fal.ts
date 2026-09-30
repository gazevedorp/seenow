import { ProviderRequestError, httpFailure } from "./retry.ts"

type FalImage = { url?: unknown }

export async function falFluxFill(
  key: string,
  model: string,
  imageUri: string,
  maskUri: string,
  prompt: string,
): Promise<Buffer> {
  const response = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt.slice(0, 4000),
      image_url: imageUri,
      mask_url: maskUri,
      num_images: 1,
      output_format: "jpeg",
      enhance_prompt: false,
      safety_tolerance: "2",
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    throw httpFailure(response.status, `Fal recusou o Flux Fill (${response.status}).`)
  }
  const payload = (await response.json()) as { images?: FalImage[]; detail?: unknown; error?: unknown }
  const url = payload.images?.map((image) => image.url).find((value) => typeof value === "string")
  if (typeof url !== "string") {
    throw new ProviderRequestError("O Flux Fill não devolveu imagem.", 502, true)
  }
  if (url.startsWith("data:")) {
    const payloadBase64 = url.slice(url.indexOf(",") + 1)
    return Buffer.from(payloadBase64, "base64")
  }
  const image = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!image.ok) throw httpFailure(image.status, "Não foi possível baixar o polimento da Fal.")
  return Buffer.from(await image.arrayBuffer())
}
