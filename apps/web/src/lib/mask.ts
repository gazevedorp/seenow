import type { Surface } from "@seenow/shared"

export const FLOOR_HORIZON = 0.58

export const SAMPLE_WINDOW = {
  x: 0.12,
  y: 0.08,
  w: 0.28,
  h: 0.34,
} as const

export function createMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height)
}

export function maskCoverage(mask: Uint8Array): number {
  if (mask.length === 0) return 0
  let marked = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]! >= 128) marked += 1
  }
  return marked / mask.length
}

function fillRect(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
) {
  const x0 = Math.max(0, Math.round(x))
  const y0 = Math.max(0, Math.round(y))
  const x1 = Math.min(width, Math.round(x + w))
  const y1 = Math.min(height, Math.round(y + h))
  for (let yy = y0; yy < y1; yy++) {
    mask.fill(value, yy * width + x0, yy * width + x1)
  }
}

/** Wall band above the floor, with floor pixels removed, when SegFormer returns no wall. */
export function fallbackWallMask(floor: Uint8Array, width: number, height: number): Uint8Array {
  const geometric = autoMask(width, height, "WALL")
  const out = new Uint8Array(geometric.length)
  const limit = Math.min(out.length, floor.length)
  for (let index = 0; index < limit; index++) {
    if ((geometric[index] ?? 0) >= 128 && (floor[index] ?? 0) < 128) out[index] = 255
  }
  return out
}

export function autoMask(width: number, height: number, surface: Surface): Uint8Array {
  const mask = createMask(width, height)
  const floorTop = Math.round(height * FLOOR_HORIZON)
  if (surface === "FLOOR") {
    const inset = Math.round(width * 0.04)
    for (let y = floorTop; y < height; y++) {
      const t = (y - floorTop) / Math.max(1, height - floorTop)
      const left = Math.round(inset * (1 - t))
      const right = width - left
      mask.fill(255, y * width + left, y * width + right)
    }
    return mask
  }

  fillRect(mask, width, height, 0, 0, width, floorTop, 255)
  const baseboard = Math.max(8, Math.round(height * 0.018))
  fillRect(mask, width, height, 0, floorTop - baseboard, width, baseboard, 0)
  fillRect(
    mask,
    width,
    height,
    width * SAMPLE_WINDOW.x,
    height * SAMPLE_WINDOW.y,
    width * SAMPLE_WINDOW.w,
    height * SAMPLE_WINDOW.h,
    0,
  )
  return mask
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
