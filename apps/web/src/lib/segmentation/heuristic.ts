export type SegmentSurface = "FLOOR" | "WALL"

export type HeuristicSegment = {
  mask: Uint8Array
  source: "photo" | "geometric"
}

type Rgb = { r: number; g: number; b: number }
type Sample = Rgb & { y: number }

const MAX_EDGE = 160

function colorDist(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr * 0.8 + dg * dg + db * db * 0.7)
}

function luma(rgb: Rgb): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b
}

function isOpening(rgb: Rgb, referenceLuma: number): boolean {
  const max = Math.max(rgb.r, rgb.g, rgb.b)
  const min = Math.min(rgb.r, rgb.g, rgb.b)
  const saturation = max === 0 ? 0 : (max - min) / max
  const value = luma(rgb)
  const brighterThanRoom = value >= referenceLuma + 14 && saturation <= 0.28
  const sky = rgb.b > rgb.r + 14 && rgb.b >= rgb.g - 8 && value >= referenceLuma + 6 && saturation <= 0.4
  return brighterThanRoom || sky
}

function medianLuma(data: Uint8ClampedArray, width: number, height: number): number {
  const values: number[] = []
  const y1 = Math.max(1, Math.round(height * 0.5))
  for (let y = Math.round(height * 0.04); y < y1; y++) {
    for (let x = 0; x < width; x++) values.push(luma(at(data, y * width + x)))
  }
  if (values.length === 0) return 180
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)] ?? 180
}

function at(data: Uint8ClampedArray, index: number): Rgb {
  const offset = index * 4
  return {
    r: data[offset] ?? 0,
    g: data[offset + 1] ?? 0,
    b: data[offset + 2] ?? 0,
  }
}

function downscale(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const nextWidth = Math.max(8, Math.round(width * scale))
  const nextHeight = Math.max(8, Math.round(height * scale))
  if (nextWidth === width && nextHeight === height) return { data, width, height }
  const out = new Uint8ClampedArray(nextWidth * nextHeight * 4)
  for (let y = 0; y < nextHeight; y++) {
    const y0 = Math.floor((y * height) / nextHeight)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / nextHeight))
    for (let x = 0; x < nextWidth; x++) {
      const x0 = Math.floor((x * width) / nextWidth)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / nextWidth))
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const offset = (yy * width + xx) * 4
          r += data[offset] ?? 0
          g += data[offset + 1] ?? 0
          b += data[offset + 2] ?? 0
          count += 1
        }
      }
      const offset = (y * nextWidth + x) * 4
      out[offset] = r / count
      out[offset + 1] = g / count
      out[offset + 2] = b / count
      out[offset + 3] = 255
    }
  }
  return { data: out, width: nextWidth, height: nextHeight }
}

function upscaleMask(mask: Uint8Array, sourceWidth: number, sourceHeight: number, width: number, height: number) {
  if (sourceWidth === width && sourceHeight === height) return mask
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / height))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / width))
      out[y * width + x] = mask[sy * sourceWidth + sx] ?? 0
    }
  }
  return out
}

function clusterLowest(samples: Sample[]): Rgb | null {
  if (samples.length === 0) return null
  const k = Math.min(3, samples.length)
  const sorted = samples.slice().sort((a, b) => luma(a) - luma(b))
  const centers: Rgb[] = []
  for (let index = 0; index < k; index++) {
    const sample = sorted[Math.floor(((index + 0.5) * sorted.length) / k)]!
    centers.push({ r: sample.r, g: sample.g, b: sample.b })
  }
  const assign = new Array<number>(samples.length).fill(0)
  for (let iter = 0; iter < 6; iter++) {
    for (let index = 0; index < samples.length; index++) {
      let best = 0
      let bestDistance = Number.POSITIVE_INFINITY
      const sample = samples[index]!
      for (let centerIndex = 0; centerIndex < k; centerIndex++) {
        const distance = colorDist(sample, centers[centerIndex]!)
        if (distance < bestDistance) {
          bestDistance = distance
          best = centerIndex
        }
      }
      assign[index] = best
    }
    const next = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }))
    for (let index = 0; index < samples.length; index++) {
      const bucket = next[assign[index]!]!
      const sample = samples[index]!
      bucket.r += sample.r
      bucket.g += sample.g
      bucket.b += sample.b
      bucket.n += 1
    }
    for (let centerIndex = 0; centerIndex < k; centerIndex++) {
      const bucket = next[centerIndex]!
      if (bucket.n === 0) continue
      centers[centerIndex] = { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n }
    }
  }
  const summary = centers.map((center) => ({ ...center, n: 0, meanY: 0 }))
  for (let index = 0; index < samples.length; index++) {
    const bucket = summary[assign[index]!]!
    bucket.n += 1
    bucket.meanY += samples[index]!.y
  }
  let chosen: (typeof summary)[number] | null = null
  for (const bucket of summary) {
    if (bucket.n === 0) continue
    bucket.meanY /= bucket.n
    if (bucket.n < samples.length * 0.08) continue
    if (!chosen || bucket.meanY > chosen.meanY) chosen = bucket
  }
  if (!chosen) {
    for (const bucket of summary) {
      if (bucket.n === 0) continue
      if (!chosen || bucket.meanY > chosen.meanY) chosen = bucket
    }
  }
  return chosen ? { r: chosen.r, g: chosen.g, b: chosen.b } : null
}

function largestCluster(samples: Sample[]): Rgb | null {
  if (samples.length === 0) return null
  const k = Math.min(3, samples.length)
  const sorted = samples.slice().sort((a, b) => luma(a) - luma(b))
  const centers: Rgb[] = []
  for (let index = 0; index < k; index++) {
    const sample = sorted[Math.floor(((index + 0.5) * sorted.length) / k)]!
    centers.push({ r: sample.r, g: sample.g, b: sample.b })
  }
  const assign = new Array<number>(samples.length).fill(0)
  for (let iter = 0; iter < 5; iter++) {
    for (let index = 0; index < samples.length; index++) {
      let best = 0
      let bestDistance = Number.POSITIVE_INFINITY
      const sample = samples[index]!
      for (let centerIndex = 0; centerIndex < k; centerIndex++) {
        const distance = colorDist(sample, centers[centerIndex]!)
        if (distance < bestDistance) {
          bestDistance = distance
          best = centerIndex
        }
      }
      assign[index] = best
    }
    const next = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }))
    for (let index = 0; index < samples.length; index++) {
      const bucket = next[assign[index]!]!
      const sample = samples[index]!
      bucket.r += sample.r
      bucket.g += sample.g
      bucket.b += sample.b
      bucket.n += 1
    }
    for (let centerIndex = 0; centerIndex < k; centerIndex++) {
      const bucket = next[centerIndex]!
      if (bucket.n === 0) continue
      centers[centerIndex] = { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n }
    }
  }
  const counts = new Array<number>(k).fill(0)
  for (const group of assign) counts[group] = (counts[group] ?? 0) + 1
  let best = 0
  for (let index = 1; index < k; index++) {
    if ((counts[index] ?? 0) > (counts[best] ?? 0)) best = index
  }
  return centers[best] ?? null
}

function collect(data: Uint8ClampedArray, width: number, height: number, include: (x: number, y: number, rgb: Rgb) => boolean): Sample[] {
  const samples: Sample[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rgb = at(data, y * width + x)
      if (!include(x, y, rgb)) continue
      samples.push({ ...rgb, y })
    }
  }
  return samples
}

function findHorizon(data: Uint8ClampedArray, width: number, height: number, floorColor: Rgb): number {
  const y0 = Math.round(height * 0.28)
  const y1 = Math.round(height * 0.84)
  let bestY = Math.round(height * 0.58)
  let bestScore = Number.NEGATIVE_INFINITY
  const band = Math.max(2, Math.round(height * 0.08))
  for (let y = y0; y <= y1; y++) {
    let edge = 0
    const row = y * width
    const previous = (y - 1) * width
    for (let x = Math.round(width * 0.08); x < Math.round(width * 0.92); x++) {
      edge += colorDist(at(data, row + x), at(data, previous + x))
    }
    edge /= Math.max(1, Math.round(width * 0.84))
    const below = meanBand(data, width, height, y + 1, Math.min(height - 1, y + band))
    const above = meanBand(data, width, height, Math.max(0, y - band), Math.max(0, y - 1))
    const floorMatch = Math.max(0, 72 - colorDist(below, floorColor))
    const separation = colorDist(below, above)
    const score = edge * 0.35 + separation * 1.15 + floorMatch * 1.45
    if (score > bestScore) {
      bestScore = score
      bestY = y
    }
  }
  return bestY
}

function meanBand(data: Uint8ClampedArray, width: number, height: number, yStart: number, yEnd: number): Rgb {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  const x0 = Math.round(width * 0.12)
  const x1 = Math.max(x0 + 1, Math.round(width * 0.88))
  const top = Math.max(0, Math.min(height - 1, yStart))
  const bottom = Math.max(top, Math.min(height - 1, yEnd))
  for (let y = top; y <= bottom; y++) {
    for (let x = x0; x < x1; x++) {
      const rgb = at(data, y * width + x)
      r += rgb.r
      g += rgb.g
      b += rgb.b
      count += 1
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0 }
  return { r: r / count, g: g / count, b: b / count }
}

function flood(
  width: number,
  height: number,
  seeds: number[],
  accept: (index: number) => boolean,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  const stack: number[] = []
  for (const seed of seeds) {
    if (seed < 0 || seed >= mask.length || mask[seed] || !accept(seed)) continue
    mask[seed] = 255
    stack.push(seed)
  }
  while (stack.length > 0) {
    const current = stack.pop()!
    const x = current % width
    const y = (current - x) / width
    const tryIndex = (index: number) => {
      if (mask[index] || !accept(index)) return
      mask[index] = 255
      stack.push(index)
    }
    if (x > 0) tryIndex(current - 1)
    if (x + 1 < width) tryIndex(current + 1)
    if (y > 0) tryIndex(current - width)
    if (y + 1 < height) tryIndex(current + width)
  }
  return mask
}

function keepComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minFraction: number,
  touches: (x: number, y: number) => boolean,
): Uint8Array {
  const seen = new Uint8Array(mask.length)
  const minSize = Math.max(6, Math.floor(mask.length * minFraction))
  const kept = new Uint8Array(mask.length)
  for (let start = 0; start < mask.length; start++) {
    if (seen[start] || !mask[start]) continue
    const stack = [start]
    seen[start] = 1
    const pixels: number[] = []
    let anchored = false
    while (stack.length > 0) {
      const current = stack.pop()!
      pixels.push(current)
      const x = current % width
      const y = (current - x) / width
      if (touches(x, y)) anchored = true
      const tryIndex = (index: number) => {
        if (seen[index] || !mask[index]) return
        seen[index] = 1
        stack.push(index)
      }
      if (x > 0) tryIndex(current - 1)
      if (x + 1 < width) tryIndex(current + 1)
      if (y > 0) tryIndex(current - width)
      if (y + 1 < height) tryIndex(current + width)
    }
    if (!anchored || pixels.length < minSize) continue
    for (const pixel of pixels) kept[pixel] = 255
  }
  return kept
}

function coverageOf(mask: Uint8Array): number {
  let marked = 0
  for (let index = 0; index < mask.length; index++) {
    if ((mask[index] ?? 0) >= 128) marked += 1
  }
  return marked / Math.max(1, mask.length)
}

export function geometricRegion(width: number, height: number, surface: SegmentSurface): Uint8Array {
  const mask = new Uint8Array(width * height)
  const floorTop = Math.min(height - 1, Math.max(1, Math.round(height * 0.58)))
  if (surface === "FLOOR") {
    for (let y = floorTop; y < height; y++) mask.fill(255, y * width, (y + 1) * width)
    return mask
  }
  for (let y = 0; y < floorTop; y++) mask.fill(255, y * width, (y + 1) * width)
  return mask
}

function segmentSmall(data: Uint8ClampedArray, width: number, height: number, surface: SegmentSurface): HeuristicSegment {
  const floorSamples = collect(data, width, height, (x, y) => y >= height * 0.74 && y <= height * 0.97 && x > width * 0.12 && x < width * 0.88)
  const provisionalFloor = clusterLowest(floorSamples) ?? { r: 180, g: 160, b: 140 }
  const horizon = findHorizon(data, width, height, provisionalFloor)
  const floorBand = collect(
    data,
    width,
    height,
    (x, y) => y >= horizon + 2 && y <= height * 0.98 && x > width * 0.1 && x < width * 0.9,
  )
  const floorColor = clusterLowest(floorBand.length > 12 ? floorBand : floorSamples) ?? provisionalFloor
  const referenceLuma = medianLuma(data, width, height)
  const wallSamples = collect(
    data,
    width,
    height,
    (_x, y, rgb) => y > height * 0.04 && y < horizon - 2 && !isOpening(rgb, referenceLuma),
  )
  const wallColor = largestCluster(wallSamples) ?? meanBand(data, width, height, Math.round(height * 0.08), Math.max(0, horizon - 3))
  const colorsApart = colorDist(floorColor, wallColor)

  if (colorsApart < 16) {
    return { mask: geometricRegion(width, height, surface), source: "geometric" }
  }

  const floorSeeds: number[] = []
  for (let y = Math.max(horizon, Math.round(height * 0.86)); y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const distance = colorDist(at(data, index), floorColor)
      if (distance < 40) floorSeeds.push(index)
    }
  }

  const floorMask = flood(width, height, floorSeeds, (index) => {
    const y = Math.floor(index / width)
    if (y < horizon) return false
    const rgb = at(data, index)
    const toFloor = colorDist(rgb, floorColor)
    const toWall = colorDist(rgb, wallColor)
    if (toFloor < 44 && toFloor + 8 < toWall) return true
    return false
  })

  const grown = flood(width, height, floorSeeds, (index) => {
    if (floorMask[index]) return true
    const y = Math.floor(index / width)
    if (y < horizon) return false
    const rgb = at(data, index)
    const toFloor = colorDist(rgb, floorColor)
    const toWall = colorDist(rgb, wallColor)
    if (!(toFloor < 70 && toFloor + 4 < toWall)) return false
    const x = index % width
    const neighbors = [index - 1, index + 1, index - width, index + width]
    for (const neighbor of neighbors) {
      if (neighbor < 0 || neighbor >= floorMask.length) continue
      const nx = neighbor % width
      if (Math.abs(nx - x) > 1) continue
      if (!floorMask[neighbor]) continue
      if (colorDist(rgb, at(data, neighbor)) < 20) return true
    }
    return false
  })

  const floor = keepComponents(grown, width, height, 0.012, (_x, y) => y >= height * 0.8)

  if (surface === "FLOOR") {
    if (coverageOf(floor) < 0.05) return { mask: geometricRegion(width, height, surface), source: "geometric" }
    return { mask: floor, source: "photo" }
  }

  const wallSeeds: number[] = []
  for (let y = Math.round(height * 0.05); y < horizon - 1; y += 1) {
    for (let x = 0; x < width; x += 2) {
      const index = y * width + x
      const rgb = at(data, index)
      if (isOpening(rgb, referenceLuma) || floor[index]) continue
      const toWall = colorDist(rgb, wallColor)
      const toFloor = colorDist(rgb, floorColor)
      if (toWall < 34 && toWall + 8 < toFloor) wallSeeds.push(index)
    }
  }

  const wallMask = flood(width, height, wallSeeds, (index) => {
    if (floor[index]) return false
    const y = Math.floor(index / width)
    if (y >= horizon) return false
    const rgb = at(data, index)
    if (isOpening(rgb, referenceLuma)) return false
    const toWall = colorDist(rgb, wallColor)
    const toFloor = colorDist(rgb, floorColor)
    return toWall < 50 && toWall + 6 < toFloor
  })
  const wall = keepComponents(wallMask, width, height, 0.02, (_x, y) => y < horizon - 1)
  if (coverageOf(wall) < 0.05) return { mask: geometricRegion(width, height, surface), source: "geometric" }
  return { mask: wall, source: "photo" }
}

/**
 * Estimates the floor or wall from the photo itself.
 * When the surface cannot be separated from the rest of the room, falls back
 * to a plain lower/upper split and reports `source: "geometric"`.
 */
export function segmentHeuristic(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  surface: SegmentSurface,
): HeuristicSegment {
  if (width < 2 || height < 2 || data.length < width * height * 4) {
    return { mask: geometricRegion(Math.max(1, width), Math.max(1, height), surface), source: "geometric" }
  }
  const small = downscale(data, width, height)
  const segmented = segmentSmall(small.data, small.width, small.height, surface)
  return {
    mask: upscaleMask(segmented.mask, small.width, small.height, width, height),
    source: segmented.source,
  }
}
