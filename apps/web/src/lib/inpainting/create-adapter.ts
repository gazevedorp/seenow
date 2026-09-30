import type { InpaintingAdapter } from "@seenow/shared"
import { LocalApiInpaintingAdapter } from "@/lib/inpainting/local-api-adapter"
import { MockInpaintingAdapter } from "@/lib/inpainting/mock-adapter"
import { RemoteInpaintingAdapter } from "@/lib/inpainting/remote-adapter"

export type AdapterChoice = {
  adapter: InpaintingAdapter<HTMLCanvasElement, Blob>
  notice: string | null
}

export function createInpaintingAdapter(): AdapterChoice {
  const requested = (import.meta.env.VITE_INPAINTING_PROVIDER ?? "auto").trim().toLowerCase()
  const apiUrl = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "")

  if ((requested === "openai" || requested === "replicate") && apiUrl) {
    return {
      adapter: new RemoteInpaintingAdapter(requested, apiUrl),
      notice: null,
    }
  }

  if (requested === "mock") {
    return { adapter: new MockInpaintingAdapter(), notice: null }
  }

  return { adapter: new LocalApiInpaintingAdapter(requested), notice: null }
}
