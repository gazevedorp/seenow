import type { Surface, TextureKind } from "@seenow/shared"
import { FLOOR_HORIZON } from "@/lib/mask"

type TextureSource = {
  texture: TextureKind
  hex?: string
  accentHex: string
}

function parseHex(hex: string | undefined, fallback: string): [number, number, number] {
  const value = (hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback).slice(1)
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function noise(context: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  const image = context.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const shift = (Math.random() - 0.5) * amount
    data[i] = Math.max(0, Math.min(255, (data[i] ?? 0) + shift))
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] ?? 0) + shift * 0.85))
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] ?? 0) + shift * 0.7))
  }
  context.putImageData(image, 0, 0)
}

function drawWood(
  context: CanvasRenderingContext2D,
  source: TextureSource,
  surface: Surface,
  width: number,
  height: number,
  horizon: number,
) {
  context.fillStyle = source.hex ?? "#C4A06A"
  context.fillRect(0, 0, width, height)
  context.strokeStyle = source.accentHex
  context.globalAlpha = 0.45
  if (surface === "FLOOR") {
    const vanishY = height * Math.max(0.05, horizon - 0.08)
    const vanishX = width * 0.5
    context.lineWidth = Math.max(1, width * 0.002)
    for (let i = 1; i <= 16; i++) {
      const t = i / 16
      const y = vanishY + (height - vanishY) * Math.pow(t, 1.55)
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }
    for (let i = 0; i <= 7; i++) {
      context.beginPath()
      context.moveTo(vanishX, vanishY)
      context.lineTo((i / 7) * width, height)
      context.stroke()
    }
  } else {
    context.lineWidth = Math.max(1, width * 0.004)
    const boards = 8
    for (let i = 1; i < boards; i++) {
      const x = (i / boards) * width
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
    }
  }
  context.globalAlpha = 1
  noise(context, width, height, 16)
}

function drawMarble(
  context: CanvasRenderingContext2D,
  source: TextureSource,
  width: number,
  height: number,
) {
  context.fillStyle = source.hex ?? "#F3EFE6"
  context.fillRect(0, 0, width, height)
  context.strokeStyle = source.accentHex
  context.globalAlpha = 0.55
  context.lineWidth = Math.max(1.5, width * 0.006)
  for (let vein = 0; vein < 6; vein++) {
    let x = Math.random() * width
    let y = Math.random() * height * 0.2
    context.beginPath()
    context.moveTo(x, y)
    for (let step = 0; step < 5; step++) {
      const cx = x + (Math.random() - 0.35) * width * 0.3
      const cy = y + height * 0.12
      x += (Math.random() - 0.2) * width * 0.18
      y += height * 0.16
      context.quadraticCurveTo(cx, cy, x, y)
    }
    context.stroke()
  }
  context.globalAlpha = 1
  noise(context, width, height, 10)
}

function drawConcrete(
  context: CanvasRenderingContext2D,
  source: TextureSource,
  width: number,
  height: number,
) {
  context.fillStyle = source.hex ?? "#B7B2AA"
  context.fillRect(0, 0, width, height)
  context.strokeStyle = source.accentHex
  context.globalAlpha = 0.35
  context.lineWidth = Math.max(1, width * 0.003)
  const cells = 4
  for (let i = 1; i < cells; i++) {
    context.beginPath()
    context.moveTo((i / cells) * width, 0)
    context.lineTo((i / cells) * width, height)
    context.moveTo(0, (i / cells) * height)
    context.lineTo(width, (i / cells) * height)
    context.stroke()
  }
  context.globalAlpha = 1
  noise(context, width, height, 18)
}

function drawStone(
  context: CanvasRenderingContext2D,
  source: TextureSource,
  width: number,
  height: number,
) {
  context.fillStyle = source.hex ?? "#E4D2B8"
  context.fillRect(0, 0, width, height)
  const [r, g, b] = parseHex(source.accentHex, "#B89B74")
  const rowHeight = Math.max(18, Math.round(height / 7))
  for (let y = 0; y < height; y += rowHeight) {
    const offset = (Math.floor(y / rowHeight) % 2) * (width * 0.18)
    for (let x = -width; x < width; x += width * 0.38) {
      context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.28)`
      context.fillRect(x + offset + 2, y + 2, width * 0.36, rowHeight - 4)
    }
  }
  noise(context, width, height, 12)
}

function drawPaint(
  context: CanvasRenderingContext2D,
  source: TextureSource,
  width: number,
  height: number,
) {
  context.fillStyle = source.hex ?? "#E6C79A"
  context.fillRect(0, 0, width, height)
  noise(context, width, height, 8)
}

export function drawTexture(
  context: CanvasRenderingContext2D,
  source: TextureSource,
  surface: Surface,
  width: number,
  height: number,
  horizon = FLOOR_HORIZON,
) {
  if (source.texture === "paint") drawPaint(context, source, width, height)
  else if (source.texture === "wood") drawWood(context, source, surface, width, height, horizon)
  else if (source.texture === "marble") drawMarble(context, source, width, height)
  else if (source.texture === "concrete") drawConcrete(context, source, width, height)
  else drawStone(context, source, width, height)
}

export function relight(texture: number, source: number): number {
  const mixed = (texture / 255) * (0.45 + 0.85 * (source / 255))
  return Math.max(0, Math.min(255, Math.round(mixed * 255)))
}

export function parseColor(hex: string | undefined, fallback: string): [number, number, number] {
  return parseHex(hex, fallback)
}
