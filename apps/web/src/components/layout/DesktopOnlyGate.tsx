import { useSyncExternalStore, type ReactNode } from "react"

const NARROW_QUERY = "(max-width: 1023px)"

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY)
  media.addEventListener("change", onStoreChange)
  return () => media.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return window.matchMedia(NARROW_QUERY).matches
}

export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const blocked = useSyncExternalStore(subscribe, getSnapshot, () => false)

  if (blocked) {
    return (
      <main className="grid min-h-svh place-items-center bg-background px-6 text-foreground">
        <div className="mx-auto max-w-md text-center">
          <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">SEENOW</p>
          <h1 className="mt-4 text-3xl leading-tight font-medium tracking-tight text-balance">
            O SEENOW é feito para computador
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground text-balance">
            Use um monitor ou notebook com pelo menos 1024 px de largura para editar máscaras e comparar resultados.
          </p>
        </div>
      </main>
    )
  }

  return children
}
