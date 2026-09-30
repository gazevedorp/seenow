import type { Surface } from "@seenow/shared"
import { cn } from "cn"

const OPTIONS: Array<{ id: Surface; title: string; copy: string; swatch: string }> = [
  {
    id: "FLOOR",
    title: "Piso",
    copy: "Madeira, porcelanato e revestimento de chão.",
    swatch: "bg-[linear-gradient(160deg,#e7d3b4_0%,#b8895a_100%)]",
  },
  {
    id: "WALL",
    title: "Parede",
    copy: "Tinta ou revestimento na parede principal.",
    swatch: "bg-[linear-gradient(160deg,#f4efe6_0%,#8ea4b0_100%)]",
  },
]

export function SurfaceSelector({
  value,
  onChange,
}: {
  value: Surface | null
  onChange: (surface: Surface) => void
}) {
  return (
    <div className="grid gap-3">
      {OPTIONS.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex items-center gap-4 rounded-2xl bg-card p-3 text-left ring-1 ring-foreground/10",
              selected && "ring-2 ring-pine",
            )}
          >
            <span className={cn("size-16 shrink-0 rounded-xl", option.swatch)} />
            <span>
              <span className="block font-display text-3xl leading-none">{option.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{option.copy}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
