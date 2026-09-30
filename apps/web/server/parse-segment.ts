export type SegmentSurface = "FLOOR" | "WALL"

const FLOOR_LABELS = new Set(["floor", "flooring"])
const WALL_LABELS = new Set(["wall"])

export function labelMatches(surface: SegmentSurface, label: string): boolean {
  const name = label.trim().toLowerCase()
  if (surface === "FLOOR") return FLOOR_LABELS.has(name)
  return WALL_LABELS.has(name)
}

export function isGroundedModel(model: string): boolean {
  return model.toLowerCase().includes("grounded")
}

/**
 * Pulls mask image URLs out of a Replicate prediction.
 * ADE20K SegFormer returns `{label, mask}[]`. Grounded SAM yields four images;
 * index 2 is the positive mask.
 */
export function selectMaskUrls(output: unknown, surface: SegmentSurface, model: string): string[] {
  if (Array.isArray(output) && output.every((item) => typeof item === "string")) {
    const urls = output as string[]
    if (isGroundedModel(model)) {
      const mask = urls[2]
      return mask ? [mask] : []
    }
    return []
  }
  if (!Array.isArray(output)) return []
  const urls: string[] = []
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const record = item as { label?: unknown; mask?: unknown }
    if (typeof record.label !== "string" || typeof record.mask !== "string") continue
    if (!labelMatches(surface, record.label)) continue
    urls.push(record.mask)
  }
  return urls
}
