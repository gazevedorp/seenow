import type { Surface } from "@seenow/shared"

export const FLOOR_HORIZON = 0.58

export const SAMPLE_WINDOW = {
  x: 0.12,
  y: 0.08,
  w: 0.28,
  h: 0.34,
} as const

/** First strong row of a floor mask, or the bottom of a wall mask, as a fraction of height. */
export function maskHorizonRatio(mask: Uint8Array, width: number, height: number, surface: Surface): number {
  const minRun = Math.max(4, Math.round(width * 0.08))
  const rowCount = (y: number) => {
    let count = 0
    const row = y * width
    for (let x = 0; x < width; x++) {
      if ((mask[row + x] ?? 0) >= 128) count += 1
    }
    return count
  }
  if (surface === "FLOOR") {
    for (let y = 0; y < height; y++) {
      if (rowCount(y) >= minRun) return y / height
    }
  } else {
    for (let y = height - 1; y >= 0; y--) {
      if (rowCount(y) >= minRun) return (y + 1) / height
    }
  }
  return FLOOR_HORIZON
}

export function maskCoverage(mask: Uint8Array): number {
  if (mask.length === 0) return 0
  let marked = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]! >= 128) marked += 1
  }
  return marked / mask.length
}

export function stampMask(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  mode: "add" | "erase",
) {
  const r = Math.max(1, radius)
  const inner = r * 0.7
  const x0 = Math.max(0, Math.floor(x - r))
  const x1 = Math.min(width - 1, Math.ceil(x + r))
  const y0 = Math.max(0, Math.floor(y - r))
  const y1 = Math.min(height - 1, Math.ceil(y + r))
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const distance = Math.hypot(xx - x, yy - y)
      if (distance > r) continue
      const falloff = distance <= inner ? 1 : 1 - (distance - inner) / (r - inner)
      const value = Math.round(255 * falloff)
      const index = yy * width + xx
      const current = mask[index] ?? 0
      mask[index] = mode === "add" ? Math.max(current, value) : Math.min(current, 255 - value)
    }
  }
}

export function stampLine(
  mask: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  mode: "add" | "erase",
) {
  const distance = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.35)))
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    stampMask(mask, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, mode)
  }
}
