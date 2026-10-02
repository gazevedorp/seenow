import { cn } from "cn"

export type RailState = "current" | "done" | "upcoming"

export function StepRail({
  steps,
}: {
  steps: Array<{
    id: string
    label: string
    index: number
    state: RailState
    enabled: boolean
    onSelect: () => void
  }>
}) {
  return (
    <nav aria-label="Etapas da simulação" className="min-w-0">
      <ol className="flex gap-1 overflow-x-auto">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              disabled={!step.enabled}
              aria-current={step.state === "current" ? "step" : undefined}
              onClick={step.onSelect}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors disabled:opacity-40",
                step.state === "current" && "bg-primary text-primary-foreground",
                step.state === "done" && "bg-secondary text-foreground",
                step.state === "upcoming" && "bg-muted text-muted-foreground",
              )}
            >
              <span className="mr-1 font-mono text-xs tabular-nums">{step.index}</span>
              {step.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
