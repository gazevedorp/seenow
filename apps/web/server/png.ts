import { deflateSync } from "node:zlib"

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let index = 0; index < buffer.length; index++) {
    crc ^= buffer[index] ?? 0
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function wrapPng(width: number, height: number, colorType: number, compressed: Buffer): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = colorType
  header[10] = 0
  header[11] = 0
  header[12] = 0
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))])
}

export function encodeRgbPng(pixels: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3)
    raw[row] = 0
    const source = y * width * 3
    for (let channel = 0; channel < width * 3; channel++) raw[row + 1 + channel] = pixels[source + channel] ?? 0
  }
  return wrapPng(width, height, 2, deflateSync(raw))
}

export function encodeGrayPng(pixels: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (width + 1))
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1)
    raw[row] = 0
    for (let x = 0; x < width; x++) raw[row + 1 + x] = pixels[y * width + x] ?? 0
  }
  return wrapPng(width, height, 0, deflateSync(raw))
}
