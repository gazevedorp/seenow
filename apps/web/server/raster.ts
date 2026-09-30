export function polygonsFromJson(value: unknown): number[][][] {
  if (!value || typeof value !== "object") return []
  const raw = (value as { polygons?: unknown }).polygons
  if (!Array.isArray(raw)) return []
  const polygons: number[][][] = []
  for (const polygon of raw) {
    if (!Array.isArray(polygon)) continue
    const points: number[][] = []
    for (const point of polygon) {
      if (!Array.isArray(point) || point.length < 2) continue
      const x = Number(point[0])
      const y = Number(point[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      points.push([clamp01(x), clamp01(y)])
    }
    if (points.length >= 3) polygons.push(points)
  }
  return polygons
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function rasterizePolygons(polygons: number[][][], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (const polygon of polygons) {
    let minY = height
    let maxY = 0
    const points = polygon.map(([x, y]) => ({ x: (x ?? 0) * width, y: (y ?? 0) * height }))
    for (const point of points) {
      minY = Math.min(minY, Math.floor(point.y))
      maxY = Math.max(maxY, Math.ceil(point.y))
    }
    minY = Math.max(0, minY)
    maxY = Math.min(height - 1, maxY)
    for (let y = minY; y <= maxY; y++) {
      const crossings: number[] = []
      for (let index = 0; index < points.length; index++) {
        const start = points[index]!
        const end = points[(index + 1) % points.length]!
        const crosses = (start.y <= y && end.y > y) || (end.y <= y && start.y > y)
        if (!crosses || start.y === end.y) continue
        const t = (y + 0.5 - start.y) / (end.y - start.y)
        crossings.push(start.x + t * (end.x - start.x))
      }
      crossings.sort((a, b) => a - b)
      for (let index = 0; index + 1 < crossings.length; index += 2) {
        const x0 = Math.max(0, Math.ceil(crossings[index]!))
        const x1 = Math.min(width, Math.floor(crossings[index + 1]!))
        for (let x = x0; x < x1; x++) mask[y * width + x] = 255
      }
    }
  }
  return mask
}

export function maskCoverage(mask: Uint8Array): number {
  let marked = 0
  for (let index = 0; index < mask.length; index++) {
    if ((mask[index] ?? 0) >= 128) marked += 1
  }
  return marked / Math.max(1, mask.length)
}
