function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/** Photoshop-style soft light. `base` and `blend` are 0..1. */
export function softLight(base: number, blend: number): number {
  if (blend <= 0.5) return base - (1 - 2 * blend) * base * (1 - base)
  const dodge =
    base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(Math.max(0, base))
  return base + (2 * blend - 1) * (dodge - base)
}

/**
 * Keep the catalog color and fold in the photo's luminance so shadows stay.
 * `meanSource` is the average luminance inside the mask (0..255).
 */
export function relightTexture(texture: number, source: number, meanSource: number): number {
  const base = texture / 255
  const luminance = source / 255
  const mean = Math.max(0.08, meanSource / 255)
  const gain = Math.max(0.42, Math.min(1.55, luminance / mean))
  const multiplied = texture * gain
  const soft = softLight(base, luminance) * 255
  return clampByte(multiplied * 0.72 + soft * 0.28)
}

export function luminance(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
