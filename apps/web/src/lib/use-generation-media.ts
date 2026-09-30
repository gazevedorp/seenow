import { useEffect, useState } from "react"
import type { GenerationRecord } from "@seenow/shared"
import { getBlob, keys } from "@/lib/db"

export function useGenerationThumbs(items: GenerationRecord[]): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    void (async () => {
      const next: Record<string, string> = {}
      for (const item of items) {
        const blob = await getBlob(keys.result(item.id))
        if (!blob) continue
        const url = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(url)
          continue
        }
        created.push(url)
        next[item.id] = url
      }
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url))
        return
      }
      setThumbs(next)
    })()
    return () => {
      cancelled = true
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [items])

  return thumbs
}

export function useGenerationPair(id: string | null): { before: string; after: string } | null {
  const [pair, setPair] = useState<{ id: string; before: string; after: string } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const created: string[] = []
    void (async () => {
      const [before, after] = await Promise.all([getBlob(keys.original(id)), getBlob(keys.result(id))])
      if (!before || !after) return
      const beforeUrl = URL.createObjectURL(before)
      const afterUrl = URL.createObjectURL(after)
      if (cancelled) {
        URL.revokeObjectURL(beforeUrl)
        URL.revokeObjectURL(afterUrl)
        return
      }
      created.push(beforeUrl, afterUrl)
      setPair({ id, before: beforeUrl, after: afterUrl })
    })()
    return () => {
      cancelled = true
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [id])

  if (!pair || pair.id !== id) return null
  return { before: pair.before, after: pair.after }
}
