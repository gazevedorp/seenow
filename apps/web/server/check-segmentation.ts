import assert from "node:assert/strict"
import { inflateSync } from "node:zlib"
import { compositeMasked } from "../src/lib/compose.ts"
import { segmentHeuristic } from "../src/lib/segmentation/heuristic.ts"
import { readServerAiEnv, resolveInpainting, resolveSegmentation } from "./env.ts"
import { encodeGrayPng } from "./png.ts"
import { labelMatches, selectMaskUrls } from "./parse-segment.ts"
import { maskCoverage, rasterizePolygons } from "./raster.ts"

function paint(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: [number, number, number],
) {
  const x1 = Math.min(width, x + w)
  const height = data.length / 4 / width
  const y1 = Math.min(height, y + h)
  for (let yy = y; yy < y1; yy++) {
    for (let xx = x; xx < x1; xx++) {
      const offset = (yy * width + xx) * 4
      data[offset] = rgb[0]
      data[offset + 1] = rgb[1]
      data[offset + 2] = rgb[2]
      data[offset + 3] = 255
    }
  }
}

function ratio(
  mask: Uint8Array,
  width: number,
  height: number,
  inside: (x: number, y: number) => boolean,
): number {
  let hit = 0
  let total = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue
      total += 1
      if ((mask[y * width + x] ?? 0) >= 128) hit += 1
    }
  }
  return total === 0 ? 0 : hit / total
}

function roomScene() {
  const width = 120
  const height = 90
  const data = new Uint8ClampedArray(width * height * 4)
  paint(data, width, 0, 0, width, height, [216, 207, 195])
  paint(data, width, 0, 52, width, height - 52, [203, 184, 154])
  paint(data, width, 14, 8, 34, 30, [214, 228, 234])
  paint(data, width, 40, 34, 46, 18, [61, 83, 72])
  paint(data, width, 100, 56, 12, 22, [109, 143, 120])
  return { data, width, height }
}

const scene = roomScene()
const floor = segmentHeuristic(scene.data, scene.width, scene.height, "FLOOR")
assert.equal(floor.source, "photo", "piso da foto de exemplo deve vir da imagem, não do recorte fixo")
assert.ok(
  ratio(floor.mask, scene.width, scene.height, (x, y) => y >= 54 && !(x >= 100 && x < 112 && y >= 56 && y < 78)) > 0.8,
  "a maior parte do piso visível entra na máscara",
)
assert.ok(
  ratio(floor.mask, scene.width, scene.height, (x, y) => x >= 100 && x < 112 && y >= 56 && y < 78) < 0.2,
  "o vaso sobre o piso fica de fora",
)
assert.ok(
  ratio(floor.mask, scene.width, scene.height, (x, y) => x >= 40 && x < 86 && y >= 34 && y < 52) < 0.15,
  "o sofá não entra no piso",
)
assert.ok(
  ratio(floor.mask, scene.width, scene.height, (_x, y) => y < 40) < 0.08,
  "a parede não entra no piso",
)

const wall = segmentHeuristic(scene.data, scene.width, scene.height, "WALL")
assert.equal(wall.source, "photo")
assert.ok(
  ratio(wall.mask, scene.width, scene.height, (x, y) => y < 50 && !(x >= 14 && x < 48 && y >= 8 && y < 38) && !(x >= 40 && x < 86 && y >= 34)) > 0.72,
  "a parede principal entra na máscara",
)
assert.ok(
  ratio(wall.mask, scene.width, scene.height, (x, y) => x >= 14 && x < 48 && y >= 8 && y < 38) < 0.25,
  "a janela fica de fora da parede",
)
assert.ok(ratio(wall.mask, scene.width, scene.height, (_x, y) => y >= 54) < 0.08, "o piso fica de fora da parede")

const livedInWidth = 100
const livedInHeight = 80
const livedIn = new Uint8ClampedArray(livedInWidth * livedInHeight * 4)
paint(livedIn, livedInWidth, 0, 0, livedInWidth, livedInHeight, [236, 232, 226])
paint(livedIn, livedInWidth, 0, 46, livedInWidth, livedInHeight - 46, [196, 154, 112])
for (let y = 46; y < livedInHeight; y++) {
  for (let x = 0; x < livedInWidth; x++) {
    if ((x + y) % 7 === 0) {
      const offset = (y * livedInWidth + x) * 4
      livedIn[offset] = 176
      livedIn[offset + 1] = 132
      livedIn[offset + 2] = 90
    }
  }
}
paint(livedIn, livedInWidth, 8, 6, 28, 22, [150, 190, 220])
paint(livedIn, livedInWidth, 28, 52, 40, 18, [48, 62, 70])
const livedFloor = segmentHeuristic(livedIn, livedInWidth, livedInHeight, "FLOOR")
assert.equal(livedFloor.source, "photo")
assert.ok(
  ratio(livedFloor.mask, livedInWidth, livedInHeight, (x, y) => y >= 48 && !(x >= 28 && x < 68 && y >= 52 && y < 70)) > 0.75,
  "piso com variação de cor continua marcado",
)
assert.ok(
  ratio(livedFloor.mask, livedInWidth, livedInHeight, (x, y) => x >= 28 && x < 68 && y >= 52 && y < 70) < 0.2,
  "sofá no meio do piso fica de fora",
)
const livedWall = segmentHeuristic(livedIn, livedInWidth, livedInHeight, "WALL")
assert.equal(livedWall.source, "photo")
assert.ok(
  ratio(livedWall.mask, livedInWidth, livedInHeight, (x, y) => y < 44 && !(x >= 8 && x < 36 && y >= 6 && y < 28)) > 0.7,
)
assert.ok(
  ratio(livedWall.mask, livedInWidth, livedInHeight, (x, y) => x >= 8 && x < 36 && y >= 6 && y < 28) < 0.25,
  "janela azul fica de fora da parede clara",
)

const width = 80
const height = 60
const flat = new Uint8ClampedArray(width * height * 4)
paint(flat, width, 0, 0, width, height, [180, 170, 160])
const ambiguous = segmentHeuristic(flat, width, height, "FLOOR")
assert.equal(ambiguous.source, "geometric")
assert.ok(ambiguous.mask.some((value) => value >= 128))

const source = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 7, 8, 9, 255])
const generated = new Uint8ClampedArray([200, 0, 0, 255, 0, 200, 0, 255, 0, 0, 200, 255])
const mask = new Uint8Array([0, 255, 128])
const composed = compositeMasked(source, generated, mask)
assert.deepEqual(Array.from(composed.slice(0, 4)), [10, 20, 30, 255])
assert.deepEqual(Array.from(composed.slice(4, 8)), [0, 200, 0, 255])
assert.equal(composed[8], Math.round((7 * 127) / 255))
assert.equal(composed[11], 255)

assert.equal(labelMatches("FLOOR", "floor"), true)
assert.equal(labelMatches("FLOOR", "rug"), false)
assert.equal(labelMatches("WALL", "wall"), true)
assert.equal(labelMatches("WALL", "windowpane"), false)
assert.deepEqual(
  selectMaskUrls(
    [
      { label: "wall", mask: "https://example.test/wall.png" },
      { label: "floor", mask: "https://example.test/floor.png" },
      { label: "windowpane", mask: "https://example.test/window.png" },
    ],
    "FLOOR",
    "simbrams/segformer-b5-finetuned-ade-640-640",
  ),
  ["https://example.test/floor.png"],
)
assert.deepEqual(
  selectMaskUrls(
    ["https://example.test/overlay.jpg", "https://example.test/neg.jpg", "https://example.test/mask.jpg", "https://example.test/invert.jpg"],
    "WALL",
    "schananas/grounded_sam",
  ),
  ["https://example.test/mask.jpg"],
)

const square = rasterizePolygons(
  [
    [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.75, 0.75],
      [0.25, 0.75],
    ],
  ],
  40,
  40,
)
assert.ok(square[20 * 40 + 20] === 255)
assert.equal(square[0], 0)
assert.ok(maskCoverage(square) > 0.2 && maskCoverage(square) < 0.3)
const png = encodeGrayPng(new Uint8Array([0, 255, 255, 0]), 2, 2)
assert.equal(png[0], 137)
assert.equal(png.toString("ascii", 12, 16), "IHDR")
const idatParts: Buffer[] = []
let pngOffset = 8
while (pngOffset < png.length) {
  const length = png.readUInt32BE(pngOffset)
  const type = png.toString("ascii", pngOffset + 4, pngOffset + 8)
  if (type === "IDAT") idatParts.push(png.subarray(pngOffset + 8, pngOffset + 8 + length))
  pngOffset += 12 + length
  if (type === "IEND") break
}
const raw = inflateSync(Buffer.concat(idatParts))
assert.deepEqual(Array.from(raw), [0, 0, 255, 0, 255, 0])
assert.equal(resolveSegmentation({
  replicateToken: "",
  openaiKey: "sk-test",
  segmentationProvider: "auto",
  inpaintingProvider: "auto",
  segmentModel: "simbrams/segformer-b5-finetuned-ade-640-640",
  inpaintModel: "black-forest-labs/flux-fill-pro",
  openaiSegmentModel: "gpt-4.1-mini",
  openaiInpaintModel: "gpt-image-1.5",
  openaiImageQuality: "low",
}).provider, "heuristic")
assert.equal(resolveSegmentation({
  replicateToken: "r8_test",
  openaiKey: "",
  segmentationProvider: "auto",
  inpaintingProvider: "auto",
  segmentModel: "schananas/grounded_sam",
  inpaintModel: "black-forest-labs/flux-fill-pro",
  openaiSegmentModel: "gpt-4.1-mini",
  openaiInpaintModel: "gpt-image-1.5",
  openaiImageQuality: "low",
}).provider, "replicate")
assert.equal(
  resolveInpainting(readServerAiEnv({ OPENAI_API_KEY: "sk-test" }), "auto").provider,
  "openai",
)
assert.equal(resolveInpainting(readServerAiEnv({}), "mock").provider, "mock")

console.log("segmentation checks ok")
