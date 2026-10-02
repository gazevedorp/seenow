import { surfaceLabel, type GenerationRecord } from "@seenow/shared"
import { cn } from "cn"
import { EmptyState } from "@/components/feedback/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { formatWhen } from "@/lib/format"

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
      <EmptyState
        title="Nenhuma versão"
        description="Nenhuma versão salva neste projeto. Gere uma simulação para comparar antes e depois."
        className="px-4 py-8"
      />
    )
  }

  return (
    <ul className="grid gap-1">
      {items.map((item) => {
        const selected = item.id === activeId
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-pressed={selected}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg bg-card px-2 py-1.5 text-left ring-1 ring-foreground/10",
                selected && "ring-2 ring-pine",
              )}
            >
              {thumbs[item.id] ? (
                <img src={thumbs[item.id]} alt="" className="size-10 rounded-md object-cover" />
              ) : (
                <Skeleton className="size-10 rounded-md" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {surfaceLabel(item.surface)} · {item.productName}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {item.productSku} · {item.processingMs} ms · {formatWhen(item.createdAt)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
