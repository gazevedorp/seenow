import type { InpaintingAdapter } from "@seenow/shared"
import { MockInpaintingAdapter } from "@/lib/inpainting/mock-adapter"
import { RemoteInpaintingAdapter } from "@/lib/inpainting/remote-adapter"

export type AdapterChoice = {
  adapter: InpaintingAdapter<HTMLCanvasElement, Blob>
  notice: string | null
}

export function createInpaintingAdapter(): AdapterChoice {
  const requested = (import.meta.env.VITE_INPAINTING_PROVIDER ?? "mock").trim().toLowerCase()
  const apiUrl = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "")

  if (requested === "openai" || requested === "replicate") {
    if (!apiUrl) {
      return {
        adapter: new MockInpaintingAdapter(),
        notice: `VITE_INPAINTING_PROVIDER=${requested}, mas VITE_API_URL está vazia. A geração usa a simulação local.`,
      }
    }
    return {
      adapter: new RemoteInpaintingAdapter(requested, apiUrl),
      notice: null,
    }
  }

  return { adapter: new MockInpaintingAdapter(), notice: null }
}
