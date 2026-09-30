import {
  applyHomography,
  boxBlurMask,
  edgeBand,
  homographyFromPoints,
  integrateDepthV,
  invert3x3,
  luminance,
  quadFromMask,
  relightTexture,
  type Surface,
  type TextureAxis,
} from "@seenow/shared"

const textureCache = new Map<string, ImageData>()

async function loadTexture(url: string): Promise<ImageData> {
  const cached = textureCache.get(url)
  if (cached) return cached
  const response = await fetch(url)
  if (!response.ok) throw new Error("Não foi possível carregar a textura do catálogo.")
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error("Não foi possível ler a textura.")
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  textureCache.set(url, image)
  return image
}

function wrap(value: number, size: number): number {
  const mod = value % size
  return mod < 0 ? mod + size : mod
}

function sample(texture: ImageData, x: number, y: number): [number, number, number] {
  const width = texture.width
  const height = texture.height
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const at = (px: number, py: number, channel: number) => {
    const offset = (py * width + px) * 4 + channel
    return texture.data[offset] ?? 0
  }
  const xA = wrap(x0, width)
  const xB = wrap(x0 + 1, width)
  const yA = wrap(y0, height)
  const yB = wrap(y0 + 1, height)
  const channels = [0, 1, 2].map((channel) => {
    const top = at(xA, yA, channel) * (1 - fx) + at(xB, yA, channel) * fx
    const bottom = at(xA, yB, channel) * (1 - fx) + at(xB, yB, channel) * fx
    return top * (1 - fy) + bottom * fy
  })
  return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0]
}

/**
 * Primary material engine: warp the catalog tile into the surface quad and
 * multiply / soft-light it by the photo luminance. Pixels outside the mask stay original.
 */
export async function compositeMaterial(options: {
  source: HTMLCanvasElement
  mask: Uint8Array
  textureUrl: string
  tileScale: number
  textureAxis: TextureAxis
  surface: Surface
  depth: Float32Array | null
}): Promise<{ canvas: HTMLCanvasElement; edgeBand: Uint8Array }> {
  const { source, mask } = options
  const width = source.width
  const height = source.height
  if (mask.length !== width * height) throw new Error("A máscara não tem o tamanho da foto.")
  const sourceContext = source.getContext("2d", { willReadFrequently: true })
  if (!sourceContext) throw new Error("Não foi possível ler a foto.")
  const photo = sourceContext.getImageData(0, 0, width, height)
  const texture = await loadTexture(options.textureUrl)
  const fitted = quadFromMask(mask, width, height)
  const quad = fitted?.quad ?? [
    { x: width * 0.08, y: height * (options.surface === "FLOOR" ? 0.56 : 0.08) },
    { x: width * 0.92, y: height * (options.surface === "FLOOR" ? 0.56 : 0.08) },
    { x: width * 0.98, y: height * (options.surface === "FLOOR" ? 0.98 : 0.62) },
    { x: width * 0.02, y: height * (options.surface === "FLOOR" ? 0.98 : 0.62) },
  ]
  const matrix = homographyFromPoints(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    quad,
  )
  const inverse = invert3x3(matrix)
  const depthV =
    options.depth && options.depth.length === mask.length && fitted
      ? integrateDepthV(options.depth, mask, width, height, fitted.yFar, fitted.yNear)
      : null
  let lumSum = 0
  let lumCount = 0
  for (let index = 0; index < mask.length; index++) {
    if ((mask[index] ?? 0) < 8) continue
    const offset = index * 4
    lumSum += luminance(photo.data[offset] ?? 0, photo.data[offset + 1] ?? 0, photo.data[offset + 2] ?? 0)
    lumCount += 1
  }
  const mean = lumCount > 0 ? lumSum / lumCount : 128
  const alpha = boxBlurMask(mask, width, height, 2)
  const band = edgeBand(mask, width, height, Math.max(6, Math.round(Math.min(width, height) * 0.014)))
  const output = sourceContext.createImageData(width, height)
  const scale = Math.max(0.4, options.tileScale)
  const depthRepeats = options.surface === "FLOOR" ? 1.35 : 0.9
  const runDepth = options.textureAxis === "depth" && options.surface === "FLOOR"

  for (let y = 0; y < height; y++) {
    const rowV = depthV ? depthV[y] : null
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const offset = index * 4
      const sourceRed = photo.data[offset] ?? 0
      const sourceGreen = photo.data[offset + 1] ?? 0
      const sourceBlue = photo.data[offset + 2] ?? 0
      const cover = alpha[index] ?? 0
      if (cover === 0) {
        output.data[offset] = sourceRed
        output.data[offset + 1] = sourceGreen
        output.data[offset + 2] = sourceBlue
        output.data[offset + 3] = 255
        continue
      }
      const mapped = applyHomography(inverse, { x: x + 0.5, y: y + 0.5 })
      const planeU = mapped.x
      const planeV = rowV ?? mapped.y
      if (!Number.isFinite(planeU) || !Number.isFinite(planeV)) {
        output.data[offset] = sourceRed
        output.data[offset + 1] = sourceGreen
        output.data[offset + 2] = sourceBlue
        output.data[offset + 3] = 255
        continue
      }
      const textureX = (runDepth ? planeV * scale * depthRepeats : planeU * scale) * texture.width
      const textureY = (runDepth ? planeU * scale : planeV * scale * depthRepeats) * texture.height
      const [red, green, blue] = sample(texture, textureX, textureY)
      const sourceLum = luminance(sourceRed, sourceGreen, sourceBlue)
      let litRed = relightTexture(red, sourceLum, mean)
      let litGreen = relightTexture(green, sourceLum, mean)
      let litBlue = relightTexture(blue, sourceLum, mean)
      if ((band[index] ?? 0) >= 128) {
        litRed *= 0.92
        litGreen *= 0.92
        litBlue *= 0.92
      }
      const keep = 255 - cover
      output.data[offset] = Math.round((sourceRed * keep + litRed * cover) / 255)
      output.data[offset + 1] = Math.round((sourceGreen * keep + litGreen * cover) / 255)
      output.data[offset + 2] = Math.round((sourceBlue * keep + litBlue * cover) / 255)
      output.data[offset + 3] = 255
    }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Não foi possível compor o material.")
  context.putImageData(output, 0, 0)
  return { canvas, edgeBand: band }
}
