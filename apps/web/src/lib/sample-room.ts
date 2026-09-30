import { FLOOR_HORIZON, SAMPLE_WINDOW } from "@/lib/mask"
import { canvasToBlob } from "@/lib/images"

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  context.fillStyle = fill
  context.fill()
}

export async function renderSampleRoom(): Promise<Blob> {
  const width = 1200
  const height = 900
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Não foi possível criar a foto de exemplo.")

  const floorTop = Math.round(height * FLOOR_HORIZON)
  const wall = context.createLinearGradient(0, 0, 0, floorTop)
  wall.addColorStop(0, "#f3ece3")
  wall.addColorStop(1, "#d8cfc3")
  context.fillStyle = wall
  context.fillRect(0, 0, width, height)

  const wx = width * SAMPLE_WINDOW.x
  const wy = height * SAMPLE_WINDOW.y
  const ww = width * SAMPLE_WINDOW.w
  const wh = height * SAMPLE_WINDOW.h
  context.fillStyle = "#f7f3ec"
  context.fillRect(wx - 14, wy - 14, ww + 28, wh + 28)
  const sky = context.createLinearGradient(0, wy, 0, wy + wh)
  sky.addColorStop(0, "#b7c9d4")
  sky.addColorStop(1, "#e7eef1")
  context.fillStyle = sky
  context.fillRect(wx, wy, ww, wh)
  context.strokeStyle = "#f7f3ec"
  context.lineWidth = 12
  context.beginPath()
  context.moveTo(wx + ww / 2, wy)
  context.lineTo(wx + ww / 2, wy + wh)
  context.moveTo(wx, wy + wh * 0.46)
  context.lineTo(wx + ww, wy + wh * 0.46)
  context.stroke()

  roundRect(context, width * 0.62, height * 0.12, width * 0.18, height * 0.22, 4, "#8C3D1E")
  roundRect(context, width * 0.635, height * 0.145, width * 0.15, height * 0.17, 2, "#f6f1ea")
  context.fillStyle = "#c46a4a"
  context.fillRect(width * 0.66, height * 0.18, width * 0.1, height * 0.1)

  context.fillStyle = "#f7f3ec"
  context.fillRect(0, floorTop - 16, width, 16)

  context.beginPath()
  context.moveTo(0, floorTop)
  context.lineTo(width, floorTop)
  context.lineTo(width, height)
  context.lineTo(0, height)
  context.closePath()
  context.fillStyle = "#cbb89a"
  context.fill()
  context.strokeStyle = "rgba(92, 64, 40, 0.28)"
  context.lineWidth = 2
  for (let i = 1; i <= 7; i++) {
    const y = floorTop + ((height - floorTop) * i) / 7
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }
  for (let i = 1; i < 6; i++) {
    context.beginPath()
    context.moveTo(width * 0.5, floorTop - 40)
    context.lineTo((i / 6) * width, height)
    context.stroke()
  }

  const sofaY = floorTop - height * 0.2
  roundRect(context, width * 0.34, sofaY, width * 0.38, height * 0.18, 16, "#3d5348")
  roundRect(context, width * 0.36, sofaY - 28, width * 0.1, 40, 10, "#31443b")
  roundRect(context, width * 0.58, sofaY - 28, width * 0.1, 40, 10, "#31443b")

  context.fillStyle = "#c4a574"
  context.beginPath()
  context.ellipse(width * 0.86, floorTop + 36, 22, 16, 0, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = "#6d8f78"
  context.beginPath()
  context.ellipse(width * 0.86, floorTop - 8, 26, 46, 0, 0, Math.PI * 2)
  context.fill()

  return canvasToBlob(canvas, "image/jpeg", 0.92)
}
