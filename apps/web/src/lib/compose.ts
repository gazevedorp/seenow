/**
 * Golden rule: masked pixels come from the generated image, everything else
 * stays byte-for-byte equal to the original photo. Partial brush values blend.
 * There is no feather outside the mask.
 */
export function compositeMasked(
  source: Uint8ClampedArray,
  generated: Uint8ClampedArray,
  mask: Uint8Array,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(source.length)
  const pixels = mask.length
  for (let index = 0; index < pixels; index++) {
    const amount = mask[index] ?? 0
    const offset = index * 4
    const sr = source[offset] ?? 0
    const sg = source[offset + 1] ?? 0
    const sb = source[offset + 2] ?? 0
    if (amount <= 0) {
      out[offset] = sr
      out[offset + 1] = sg
      out[offset + 2] = sb
      out[offset + 3] = 255
      continue
    }
    const gr = generated[offset] ?? 0
    const gg = generated[offset + 1] ?? 0
    const gb = generated[offset + 2] ?? 0
    if (amount >= 255) {
      out[offset] = gr
      out[offset + 1] = gg
      out[offset + 2] = gb
    } else {
      const keep = 255 - amount
      out[offset] = Math.round((sr * keep + gr * amount) / 255)
      out[offset + 1] = Math.round((sg * keep + gg * amount) / 255)
      out[offset + 2] = Math.round((sb * keep + gb * amount) / 255)
    }
    out[offset + 3] = 255
  }
  return out
}
