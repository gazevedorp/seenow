export type MaskAssessment = {
  coverage: number
  failed: boolean
  reason: string | null
}

export function thresholdMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let index = 0; index < mask.length; index++) out[index] = (mask[index] ?? 0) >= 128 ? 255 : 0
  return out
}

export function orMasks(masks: Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length)
  for (const mask of masks) {
    const count = Math.min(length, mask.length)
    for (let index = 0; index < count; index++) {
      if ((mask[index] ?? 0) >= 128) out[index] = 255
    }
  }
  return out
}

export function subtractMask(source: Uint8Array, cut: Uint8Array): Uint8Array {
  const out = new Uint8Array(source.length)
  for (let index = 0; index < source.length; index++) {
    if ((source[index] ?? 0) >= 128 && (cut[index] ?? 0) < 128) out[index] = 255
  }
  return out
}

function dilateAxis(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): Uint8Array {
  const out = new Uint8Array(mask.length)
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      const row = y * width
      const prefix = new Int32Array(width + 1)
      for (let x = 0; x < width; x++) prefix[x + 1] = prefix[x]! + ((mask[row + x] ?? 0) >= 128 ? 1 : 0)
      for (let x = 0; x < width; x++) {
        const start = Math.max(0, x - radius)
        const end = Math.min(width - 1, x + radius)
        out[row + x] = prefix[end + 1]! - prefix[start]! > 0 ? 255 : 0
      }
    }
    return out
  }
  for (let x = 0; x < width; x++) {
    const prefix = new Int32Array(height + 1)
    for (let y = 0; y < height; y++) {
      prefix[y + 1] = prefix[y]! + ((mask[y * width + x] ?? 0) >= 128 ? 1 : 0)
    }
    for (let y = 0; y < height; y++) {
      const start = Math.max(0, y - radius)
      const end = Math.min(height - 1, y + radius)
      out[y * width + x] = prefix[end + 1]! - prefix[start]! > 0 ? 255 : 0
    }
  }
  return out
}

export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return thresholdMask(mask)
  return dilateAxis(dilateAxis(mask, width, height, radius, true), width, height, radius, false)
}

function erodeAxis(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): Uint8Array {
  const out = new Uint8Array(mask.length)
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      const row = y * width
      const prefix = new Int32Array(width + 1)
      for (let x = 0; x < width; x++) prefix[x + 1] = prefix[x]! + ((mask[row + x] ?? 0) >= 128 ? 1 : 0)
      for (let x = 0; x < width; x++) {
        const start = x - radius
        const end = x + radius
        if (start < 0 || end >= width) continue
        out[row + x] = prefix[end + 1]! - prefix[start]! === end - start + 1 ? 255 : 0
      }
    }
    return out
  }
  for (let x = 0; x < width; x++) {
    const prefix = new Int32Array(height + 1)
    for (let y = 0; y < height; y++) {
      prefix[y + 1] = prefix[y]! + ((mask[y * width + x] ?? 0) >= 128 ? 1 : 0)
    }
    for (let y = 0; y < height; y++) {
      const start = y - radius
      const end = y + radius
      if (start < 0 || end >= height) continue
      out[y * width + x] = prefix[end + 1]! - prefix[start]! === end - start + 1 ? 255 : 0
    }
  }
  return out
}

export function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return thresholdMask(mask)
  return erodeAxis(erodeAxis(mask, width, height, radius, true), width, height, radius, false)
}

export function removeSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minFraction = 0.002,
): Uint8Array {
  const seen = new Uint8Array(mask.length)
  const minPixels = Math.max(12, Math.floor(mask.length * minFraction))
  const out = new Uint8Array(mask.length)
  for (let start = 0; start < mask.length; start++) {
    if ((mask[start] ?? 0) < 128 || seen[start]) continue
    const stack = [start]
    seen[start] = 1
    const component: number[] = []
    while (stack.length > 0) {
      const current = stack.pop()!
      component.push(current)
      const x = current % width
      const y = (current - x) / width
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ]
      for (const next of neighbors) {
        if (next < 0 || seen[next] || (mask[next] ?? 0) < 128) continue
        seen[next] = 1
        stack.push(next)
      }
    }
    if (component.length < minPixels) continue
    for (const index of component) out[index] = 255
  }
  return out
}

/** 1px close to tidy SegFormer edges without swallowing furniture. */
export function cleanupSurfaceMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const binary = thresholdMask(mask)
  const closed = erodeMask(dilateMask(binary, width, height, 1), width, height, 1)
  return removeSmallComponents(closed, width, height, 0.002)
}

export function combineRoomMasks(input: {
  floor: Uint8Array
  wall: Uint8Array
  ceiling: Uint8Array
  rug: Uint8Array
  width: number
  height: number
}): { floor: Uint8Array; wall: Uint8Array } {
  const length = input.width * input.height
  const floorRaw = orMasks([input.floor, input.rug], length)
  const floor = cleanupSurfaceMask(floorRaw, input.width, input.height)
  const wallCut = orMasks([input.ceiling, floor], length)
  const wall = cleanupSurfaceMask(subtractMask(input.wall, wallCut), input.width, input.height)
  return { floor, wall }
}

export function maskCoverage(mask: Uint8Array): number {
  if (mask.length === 0) return 0
  let marked = 0
  for (let index = 0; index < mask.length; index++) {
    if ((mask[index] ?? 0) >= 128) marked += 1
  }
  return marked / mask.length
}

/**
 * SegFormer failure is an implausible region, not a sofa-shaped hole.
 * Furniture stays unmasked on purpose.
 */
export function assessSurfaceMask(mask: Uint8Array): MaskAssessment {
  const coverage = maskCoverage(mask)
  if (coverage < 0.03) {
    return { coverage, failed: true, reason: "A máscara cobre pouco da foto." }
  }
  if (coverage > 0.88) {
    return { coverage, failed: true, reason: "A máscara cobre quase a foto inteira." }
  }
  return { coverage, failed: false, reason: null }
}

/** Interior edge of the surface mask. Flux Fill repaints this band only. */
export function edgeBand(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const eroded = erodeMask(mask, width, height, Math.max(1, radius))
  const band = new Uint8Array(mask.length)
  for (let index = 0; index < mask.length; index++) {
    if ((mask[index] ?? 0) >= 128 && (eroded[index] ?? 0) < 128) band[index] = 255
  }
  return band
}

export function boxBlurMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice()
  const horizontal = new Uint8Array(mask.length)
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    const prefix = new Float64Array(width + 1)
    for (let x = 0; x < width; x++) prefix[x + 1] = prefix[x]! + (mask[row + x] ?? 0)
    for (let x = 0; x < width; x++) {
      const start = Math.max(0, x - radius)
      const end = Math.min(width, x + radius + 1)
      horizontal[row + x] = Math.round((prefix[end]! - prefix[start]!) / (end - start))
    }
  }
  for (let x = 0; x < width; x++) {
    const prefix = new Float64Array(height + 1)
    for (let y = 0; y < height; y++) prefix[y + 1] = prefix[y]! + (horizontal[y * width + x] ?? 0)
    for (let y = 0; y < height; y++) {
      const start = Math.max(0, y - radius)
      const end = Math.min(height, y + radius + 1)
      out[y * width + x] = Math.round((prefix[end]! - prefix[start]!) / (end - start))
    }
  }
  return out
}
