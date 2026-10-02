import type { Surface } from "@seenow/shared"
import { surfaceLabel } from "@seenow/shared"
import { cn } from "cn"
import { formatPercent } from "@/lib/format"
import { maskCoverage } from "@/lib/mask"

export function SurfaceToggle({
  value,
  floorMask,
  wallMask,
  onChange,
}: {
  value: Surface
  floorMask: Uint8Array | null
  wallMask: Uint8Array | null
  onChange: (surface: Surface) => void
}) {
  return (
    <fieldset>
      <legend className="sr-only">Superfície</legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(["FLOOR", "WALL"] as const).map((item) => {
          const selected = value === item
          const mask = item === "FLOOR" ? floorMask : wallMask
          return (
            <button
              key={item}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(item)}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm transition-colors",
                selected ? "bg-background text-foreground shadow-sm ring-1 ring-pine" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="block font-medium">{surfaceLabel(item)}</span>
              <span className="font-mono text-xs">{formatPercent(maskCoverage(mask ?? new Uint8Array()))}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
