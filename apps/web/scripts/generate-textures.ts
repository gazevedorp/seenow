import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { encodeRgbPng } from "../server/png.ts"

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/textures")

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x + seed * 131, 374761393) + Math.imul(y + 17, 668265263)
  n = (n ^ (n >>> 13)) >>> 0
  n = Math.imul(n, 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function fade(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function noise(x: number, y: number, periodX: number, periodY: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = fade(x - x0)
  const fy = fade(y - y0)
  const wrap = (value: number, period: number) => ((value % period) + period) % period
  const sample = (ix: number, iy: number) => hash(wrap(ix, periodX), wrap(iy, periodY), seed)
  const top = lerp(sample(x0, y0), sample(x0 + 1, y0), fx)
  const bottom = lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), fx)
  return lerp(top, bottom, fy)
}

function fbm(x: number, y: number, periodX: number, periodY: number, seed: number): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  for (let octave = 0; octave < 4; octave++) {
    value +=
      amplitude *
      noise(x * frequency, y * frequency, Math.max(1, Math.round(periodX * frequency)), Math.max(1, Math.round(periodY * frequency)), seed + octave * 19)
    amplitude *= 0.5
    frequency *= 2
  }
  return value
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function paint(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      const offset = (y * width + x) * 3
      data[offset] = clampByte(r)
      data[offset + 1] = clampByte(g)
      data[offset + 2] = clampByte(b)
    }
  }
  return data
}

function write(name: string, width: number, height: number, pixels: Uint8Array) {
  writeFileSync(resolve(outDir, name), encodeRgbPng(pixels, width, height))
}

function wood(
  width: number,
  height: number,
  base: [number, number, number],
  grain: [number, number, number],
  grout: [number, number, number],
  boards: number,
  segments: number,
): Uint8Array {
  const boardH = height / boards
  const segmentW = width / segments
  return paint(width, height, (x, y) => {
    const row = Math.floor(y / boardH)
    const localY = y - row * boardH
    const offset = (row % 2) * (segmentW / 2)
    const shifted = (x + offset) % width
    const segment = Math.floor(shifted / segmentW)
    const localX = shifted - segment * segmentW
    if (localY < 2 || localY > boardH - 3 || localX < 2) return grout
    const tone = (hash(row, segment, 3) - 0.5) * 28
    const grainLine = Math.sin(localX * 0.09 + row) * 7 + (fbm(x / 36, localY / 10, 16, 8, row + 4) - 0.45) * 26
    const mix = 0.55 + grainLine / 80
    return [
      base[0] * (1 - mix) + grain[0] * mix + tone,
      base[1] * (1 - mix) + grain[1] * mix + tone * 0.85,
      base[2] * (1 - mix) + grain[2] * mix + tone * 0.6,
    ]
  })
}

function stone(width: number, height: number): Uint8Array {
  const cell = 72
  const cols = width / cell
  const rows = height / cell
  return paint(width, height, (x, y) => {
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    let best = 1e9
    let second = 1e9
    let seed = 0
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox
        const ny = cy + oy
        const wx = ((nx % cols) + cols) % cols
        const wy = ((ny % rows) + rows) % rows
        const px = (nx + hash(wx, wy, 8)) * cell
        const py = (ny + hash(wx, wy, 15)) * cell
        const distance = Math.hypot(x - px, y - py)
        if (distance < best) {
          second = best
          best = distance
          seed = wx * 17 + wy
        } else if (distance < second) second = distance
      }
    }
    const grout = second - best < 5
    const tint = (hash(seed, 1, 2) - 0.5) * 30
    const speckle = (hash(x, y, 9) - 0.5) * 12
    if (grout) return [118 + speckle, 112 + speckle, 104 + speckle]
    return [176 + tint + speckle, 168 + tint * 0.8 + speckle, 154 + tint * 0.5 + speckle]
  })
}

function porcelain(width: number, height: number, marble: boolean): Uint8Array {
  const tile = width / 2
  return paint(width, height, (x, y) => {
    const localX = x % tile
    const localY = y % tile
    if (localX < 4 || localY < 4) return marble ? [168, 164, 156] : [122, 120, 116]
    const n = fbm(x / 70, y / 70, 8, 8, marble ? 4 : 11)
    if (!marble) {
      const speckle = (hash(x, y, 6) - 0.5) * 10
      return [176 + speckle, 174 + speckle, 168 + speckle]
    }
    const vein = Math.abs(Math.sin(x * 0.03 + n * 5.5 + y * 0.004))
    const strength = vein < 0.18 ? (0.18 - vein) * 2.2 : 0
    const warm = n * 18
    return [244 - strength * 90 + warm, 239 - strength * 70 + warm * 0.4, 230 - strength * 40]
  })
}

function carpet(width: number, height: number): Uint8Array {
  return paint(width, height, (x, y) => {
    const pile = fbm(x / 28, y / 28, 18, 18, 21)
    const fiber = hash(x, y, 33) 
    const shade = (pile - 0.5) * 28 + (fiber - 0.5) * 22
    const rib = Math.sin((x + y) * 0.35) * 4
    return [142 + shade + rib, 140 + shade + rib, 136 + shade + rib]
  })
}

function insidePointyHex(dx: number, dy: number, radius: number): boolean {
  const x = Math.abs(dx)
  const y = Math.abs(dy)
  if (y > radius) return false
  const half = (Math.sqrt(3) / 2) * radius
  if (y <= radius / 2) return x <= half
  return x <= Math.sqrt(3) * (radius - y)
}

function hexTiles(radius: number, columns: number, rows: number): { width: number; height: number; pixels: Uint8Array } {
  const tileW = Math.sqrt(3) * radius
  const tileH = radius * 3
  const width = Math.round(tileW * columns)
  const height = Math.round(tileH * rows)
  const pixels = paint(width, height, (x, y) => {
    const localX = (x / width) * tileW * columns
    const localY = (y / height) * tileH * rows
    const wrappedX = ((localX % tileW) + tileW) % tileW
    const wrappedY = ((localY % tileH) + tileH) % tileH
    const centers = [
      { x: tileW / 2, y: radius, seed: 1 },
      { x: 0, y: radius * 2.5, seed: 2 },
      { x: tileW, y: radius * 2.5, seed: 3 },
    ]
    let inside = false
    let seed = 0
    let edge = false
    for (const center of centers) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const dx = wrappedX - (center.x + ox * tileW)
          const dy = wrappedY - (center.y + oy * tileH)
          if (insidePointyHex(dx, dy, radius * 0.9)) {
            inside = true
            seed = center.seed + ox * 5 + oy * 9
          } else if (insidePointyHex(dx, dy, radius * 0.98)) edge = true
        }
      }
    }
    if (!inside) return edge ? [186, 182, 174] : [150, 146, 138]
    const tint = (hash(seed, 4, 7) - 0.5) * 16
    const speckle = (hash(x, y, 12) - 0.5) * 6
    return [236 + tint + speckle, 232 + tint + speckle, 224 + tint * 0.6 + speckle]
  })
  return { width, height, pixels }
}

function subway(width: number, height: number): Uint8Array {
  const tileW = 96
  const tileH = 40
  return paint(width, height, (x, y) => {
    const row = Math.floor(y / tileH)
    const offset = (row % 2) * (tileW / 2)
    const shifted = (x + offset) % width
    const localX = shifted % tileW
    const localY = y % tileH
    if (localX < 4 || localY < 4) return [176, 172, 166]
    const bevel = localY < 8 ? 16 : localY > tileH - 8 ? -18 : 0
    const gloss = localY < tileH * 0.35 ? 8 : 0
    const speckle = (hash(x, y, 18) - 0.5) * 5
    return [246 + bevel + gloss + speckle, 243 + bevel + gloss + speckle, 236 + bevel * 0.7 + gloss + speckle]
  })
}

mkdirSync(outDir, { recursive: true })
write("laminate-oak-light.png", 480, 480, wood(480, 480, [206, 170, 118], [146, 104, 62], [92, 66, 40], 8, 3))
write("laminate-oak-dark.png", 480, 480, wood(480, 480, [96, 66, 46], [48, 30, 22], [28, 18, 14], 8, 3))
write("vinyl-wood.png", 480, 480, wood(480, 480, [176, 122, 74], [120, 74, 40], [78, 52, 34], 10, 4))
write("vinyl-stone.png", 432, 432, stone(432, 432))
write("porcelain-gray-matte.png", 480, 480, porcelain(480, 480, false))
write("porcelain-marble.png", 480, 480, porcelain(480, 480, true))
write("carpet-gray.png", 384, 384, carpet(384, 384))
const hex = hexTiles(34, 6, 4)
write("ceramic-hex.png", hex.width, hex.height, hex.pixels)
write("ceramic-subway.png", 480, 400, subway(480, 400))
console.log("textures written to", outDir)
