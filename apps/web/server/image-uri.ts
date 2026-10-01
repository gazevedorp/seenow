const PNG = "iVBORw0KGgo"
const JPEG = "/9j/"
const WEBP = "UklGR"
const GIF = "R0lGOD"

export function sniffImageMime(base64: string): string | null {
  if (base64.startsWith(PNG)) return "image/png"
  if (base64.startsWith(JPEG)) return "image/jpeg"
  if (base64.startsWith(WEBP)) return "image/webp"
  if (base64.startsWith(GIF)) return "image/gif"
  return null
}

function compactPayload(value: string): string {
  return value.replace(/\s/g, "")
}

/** HTTPS URL, or a single data URI. Bare base64 is never returned. */
export function asImageDataUri(value: string, fallbackMime = "image/png"): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith("data:")) {
    const comma = trimmed.indexOf(",")
    if (comma < 0) return trimmed
    const header = trimmed.slice(0, comma + 1).replace(/\s/g, "")
    return header + compactPayload(trimmed.slice(comma + 1))
  }
  const payload = compactPayload(trimmed)
  const mime = sniffImageMime(payload) ?? fallbackMime
  return `data:${mime};base64,${payload}`
}

/** Inline image bytes, or null when the value is an HTTP URL that still needs a fetch. */
export function imagePayloadBase64(value: string): string | null {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return null
  if (trimmed.startsWith("data:")) {
    const comma = trimmed.indexOf(",")
    if (comma < 0) return null
    const payload = compactPayload(trimmed.slice(comma + 1))
    return payload || null
  }
  const payload = compactPayload(trimmed)
  if (!payload || !sniffImageMime(payload)) return null
  return payload
}
