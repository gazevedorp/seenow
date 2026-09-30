export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

export function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

export function providerLabel(provider: string): string {
  if (provider === "mock") return "Simulação local"
  if (provider === "openai") return "OpenAI"
  if (provider === "replicate") return "Replicate"
  return provider
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
