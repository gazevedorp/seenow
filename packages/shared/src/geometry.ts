export type Point = { x: number; y: number }

/** Image quad: far-left, far-right, near-right, near-left. */
export type Quad = [Point, Point, Point, Point]

export function applyHomography(matrix: number[], point: Point): Point {
  const weight = matrix[6]! * point.x + matrix[7]! * point.y + matrix[8]!
  return {
    x: (matrix[0]! * point.x + matrix[1]! * point.y + matrix[2]!) / weight,
    y: (matrix[3]! * point.x + matrix[4]! * point.y + matrix[5]!) / weight,
  }
}

export function invert3x3(matrix: number[]): number[] {
  const a = matrix[0]!
  const b = matrix[1]!
  const c = matrix[2]!
  const d = matrix[3]!
  const e = matrix[4]!
  const f = matrix[5]!
  const g = matrix[6]!
  const h = matrix[7]!
  const i = matrix[8]!
  const cofactorA = e * i - f * h
  const cofactorB = f * g - d * i
  const cofactorC = d * h - e * g
  const determinant = a * cofactorA + b * cofactorB + c * cofactorC
  if (Math.abs(determinant) < 1e-10) throw new Error("Homografia singular.")
  const scale = 1 / determinant
  return [
    cofactorA * scale,
    (c * h - b * i) * scale,
    (b * f - c * e) * scale,
    cofactorB * scale,
    (a * i - c * g) * scale,
    (c * d - a * f) * scale,
    cofactorC * scale,
    (b * g - a * h) * scale,
    (a * e - b * d) * scale,
  ]
}

function multiply3x3(left: number[], right: number[]): number[] {
  const out = new Array<number>(9).fill(0)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] =
        left[row * 3]! * right[col]! +
        left[row * 3 + 1]! * right[3 + col]! +
        left[row * 3 + 2]! * right[6 + col]!
    }
  }
  return out
}

function solve8(matrix: number[][], values: number[]): number[] {
  const size = 8
  const rows = matrix.map((row, index) => [...row, values[index]!])
  for (let col = 0; col < size; col++) {
    let pivot = col
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(rows[row]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = row
    }
    const swap = rows[col]!
    rows[col] = rows[pivot]!
    rows[pivot] = swap
    const divisor = rows[col]![col]!
    if (Math.abs(divisor) < 1e-12) throw new Error("Homografia singular.")
    for (let column = col; column <= size; column++) rows[col]![column]! /= divisor
    for (let row = 0; row < size; row++) {
      if (row === col) continue
      const factor = rows[row]![col]!
      if (factor === 0) continue
      for (let column = col; column <= size; column++) {
        rows[row]![column]! -= factor * rows[col]![column]!
      }
    }
  }
  return rows.map((row) => row[size]!)
}

function normalizePoints(points: Point[]): { matrix: number[]; points: Point[] } {
  let cx = 0
  let cy = 0
  for (const point of points) {
    cx += point.x
    cy += point.y
  }
  cx /= points.length
  cy /= points.length
  let distance = 0
  for (const point of points) distance += Math.hypot(point.x - cx, point.y - cy)
  const mean = distance / points.length
  const scale = Math.SQRT2 / Math.max(mean, 1e-8)
  return {
    matrix: [scale, 0, -scale * cx, 0, scale, -scale * cy, 0, 0, 1],
    points: points.map((point) => ({ x: scale * (point.x - cx), y: scale * (point.y - cy) })),
  }
}

function directLinear(source: Point[], destination: Point[]): number[] {
  const coefficients: number[][] = []
  const values: number[] = []
  for (let index = 0; index < 4; index++) {
    const x = source[index]!.x
    const y = source[index]!.y
    const u = destination[index]!.x
    const v = destination[index]!.y
    coefficients.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    values.push(u)
    coefficients.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    values.push(v)
  }
  const solved = solve8(coefficients, values)
  return [...solved, 1]
}

/** Maps `source` points onto `destination` points (4 correspondences). */
export function homographyFromPoints(source: Point[], destination: Point[]): number[] {
  if (source.length !== 4 || destination.length !== 4) {
    throw new Error("A homografia precisa de 4 pontos.")
  }
  const src = normalizePoints(source)
  const dst = normalizePoints(destination)
  const normalized = directLinear(src.points, dst.points)
  return multiply3x3(invert3x3(dst.matrix), multiply3x3(normalized, src.matrix))
}

type RowSpan = { y: number; left: number; right: number }

function maskSpans(mask: Uint8Array, width: number, height: number): RowSpan[] {
  const spans: RowSpan[] = []
  const minCount = Math.max(4, Math.round(width * 0.015))
  for (let y = 0; y < height; y++) {
    let left = -1
    let right = -1
    let count = 0
    const row = y * width
    for (let x = 0; x < width; x++) {
      if ((mask[row + x] ?? 0) < 128) continue
      if (left < 0) left = x
      right = x
      count += 1
    }
    if (count >= minCount && left >= 0 && right > left) spans.push({ y, left, right })
  }
  return spans
}

function fitLine(points: Array<{ x: number; y: number }>): { slope: number; intercept: number } {
  let sumY = 0
  let sumX = 0
  let sumYY = 0
  let sumYX = 0
  for (const point of points) {
    sumY += point.y
    sumX += point.x
    sumYY += point.y * point.y
    sumYX += point.y * point.x
  }
  const n = points.length
  const denominator = n * sumYY - sumY * sumY
  if (Math.abs(denominator) < 1e-6) {
    return { slope: 0, intercept: sumX / n }
  }
  const slope = (n * sumYX - sumY * sumX) / denominator
  const intercept = (sumX - slope * sumY) / n
  return { slope, intercept }
}

export function quadFromMask(
  mask: Uint8Array,
  width: number,
  height: number,
): { quad: Quad; yFar: number; yNear: number } | null {
  const spans = maskSpans(mask, width, height)
  if (spans.length < 6) return null
  const start = Math.max(0, Math.floor(spans.length * 0.06))
  const end = Math.min(spans.length - 1, Math.ceil(spans.length * 0.94))
  const used = spans.slice(start, end + 1)
  if (used.length < 4) return null
  const leftFit = fitLine(used.map((span) => ({ x: span.left, y: span.y })))
  const rightFit = fitLine(used.map((span) => ({ x: span.right, y: span.y })))
  const yFar = used[0]!.y
  const yNear = used[used.length - 1]!.y
  if (yNear - yFar < 4) return null
  const clampX = (value: number) => Math.max(0, Math.min(width - 1, value))
  let leftFar = clampX(leftFit.slope * yFar + leftFit.intercept)
  let rightFar = clampX(rightFit.slope * yFar + rightFit.intercept)
  let leftNear = clampX(leftFit.slope * yNear + leftFit.intercept)
  let rightNear = clampX(rightFit.slope * yNear + rightFit.intercept)
  if (rightFar - leftFar < 4) {
    leftFar = clampX(leftFar - 2)
    rightFar = clampX(rightFar + 2)
  }
  if (rightNear - leftNear < 4) {
    leftNear = clampX(leftNear - 2)
    rightNear = clampX(rightNear + 2)
  }
  return {
    yFar,
    yNear,
    quad: [
      { x: leftFar, y: yFar },
      { x: rightFar, y: yFar },
      { x: rightNear, y: yNear },
      { x: leftNear, y: yNear },
    ],
  }
}

/**
 * Row-wise texture v in [0, 1], far → near.
 * Higher depth values are treated as closer to the camera (Depth Anything convention).
 */
export function integrateDepthV(
  depth: Float32Array,
  mask: Uint8Array,
  width: number,
  height: number,
  yFar: number,
  yNear: number,
): Float32Array | null {
  const start = Math.max(0, Math.min(height - 1, Math.round(Math.min(yFar, yNear))))
  const end = Math.max(0, Math.min(height - 1, Math.round(Math.max(yFar, yNear))))
  if (end - start < 4) return null
  const weights: number[] = []
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let y = start; y <= end; y++) {
    let sum = 0
    let count = 0
    const row = y * width
    for (let x = 0; x < width; x++) {
      if ((mask[row + x] ?? 0) < 128) continue
      const value = depth[row + x] ?? 0
      sum += value
      count += 1
    }
    const mean = count > 0 ? sum / count : 0.5
    if (mean < min) min = mean
    if (mean > max) max = mean
    weights.push(mean)
  }
  if (!(max - min > 0.04)) return null
  const normalized = weights.map((value) => 0.35 + (value - min) / (max - min))
  const total = normalized.reduce((sum, value) => sum + value, 0) || 1
  const scale = new Float32Array(height)
  let cursor = 0
  for (let index = 0; index < normalized.length; index++) {
    const y = start + index
    scale[y] = cursor / total
    cursor += normalized[index]!
  }
  scale[end] = 1
  for (let y = 0; y < start; y++) scale[y] = 0
  for (let y = end + 1; y < height; y++) scale[y] = 1
  return scale
}
