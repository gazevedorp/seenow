import type { ComponentProps } from "react"
import { Slider as SliderPrimitive } from "radix-ui"
import { cn } from "cn"

function Slider({
  className,
  value,
  onValueChange,
  min = 0,
  max = 100,
  ...props
}: Omit<ComponentProps<typeof SliderPrimitive.Root>, "value" | "onValueChange" | "defaultValue"> & {
  value: number
  onValueChange: (value: number) => void
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      min={min}
      max={max}
      value={[value]}
      onValueChange={(next) => onValueChange(next[0] ?? value)}
      className={cn("relative flex w-full touch-none items-center select-none", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-4 rounded-full border border-border bg-background shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" />
    </SliderPrimitive.Root>
  )
}

export { Slider }
