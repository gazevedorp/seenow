import { Skeleton } from "@/components/ui/skeleton"

export function PhotoStepLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-72 place-items-center rounded-2xl border border-dashed bg-card px-6 py-10 text-center"
    >
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="mx-auto h-40 w-full rounded-xl" />
        <Skeleton className="mx-auto h-4 w-48" />
        <p className="text-sm text-muted-foreground">Lendo a foto do ambiente…</p>
      </div>
    </div>
  )
}

export function PhotoStepError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-6 py-5">
      <p className="font-medium text-destructive">Não foi possível usar esta foto</p>
      <p className="mt-1 text-sm text-destructive/90">{message}</p>
    </div>
  )
}
