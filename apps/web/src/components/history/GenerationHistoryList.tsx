import { surfaceLabel, type GenerationRecord } from "@seenow/shared"
import { cn } from "cn"
import { formatBrl, formatWhen, providerLabel } from "@/lib/format"

export function GenerationHistoryList({
  items,
  thumbs,
  activeId,
  onSelect,
}: {
  items: GenerationRecord[]
  thumbs: Record<string, string>
  activeId: string | null
  onSelect: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
        Nenhuma versão salva neste projeto. Gere uma simulação para comparar antes e depois.
      </p>
    )
  }

  return (
    <ul className="grid gap-2">
      {items.map((item) => {
        const selected = item.id === activeId
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-pressed={selected}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl bg-card p-2 text-left ring-1 ring-foreground/10",
                selected && "ring-2 ring-pine",
              )}
            >
              {thumbs[item.id] ? (
                <img src={thumbs[item.id]} alt="" className="size-16 rounded-lg object-cover" />
              ) : (
                <span className="size-16 rounded-lg bg-muted" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {surfaceLabel(item.surface)} · {item.productName}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {item.productSku} · {formatWhen(item.createdAt)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {providerLabel(item.provider)} · {formatBrl(item.estimatedCostBrl)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
