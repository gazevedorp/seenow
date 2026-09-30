import { useSyncExternalStore } from "react"

const STORAGE_KEY = "seenow.session.v1"

export type DemoSession = {
  email: string
  fullName: string
  organizationName: string
  mode: "demo"
}

export type AuthError = "email" | "password"

const DEMO_SESSION: DemoSession = {
  email: "ana.duarte@loja.exemplo",
  fullName: "Ana Duarte",
  organizationName: "Loja demonstração",
  mode: "demo",
}

function readSession(): DemoSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DemoSession>
    if (!parsed.email || !parsed.fullName) return null
    return {
      email: parsed.email,
      fullName: parsed.fullName,
      organizationName: parsed.organizationName || "Loja demonstração",
      mode: "demo",
    }
  } catch {
    return null
  }
}

let session: DemoSession | null = readSession()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function persist(next: DemoSession | null) {
  session = next
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  else localStorage.removeItem(STORAGE_KEY)
  emit()
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? ""
  const words = local.split(/[._-]+/).filter((part) => part.length > 0)
  if (words.length === 0) return "Operador"
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

export const auth = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot() {
    return session
  },
  enterDemo() {
    persist(DEMO_SESSION)
  },
  enterWithPassword(email: string, password: string): AuthError | null {
    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "email"
    if (password.trim().length < 4) return "password"
    persist({
      email: trimmed,
      fullName: nameFromEmail(trimmed),
      organizationName: "Loja demonstração",
      mode: "demo",
    })
    return null
  },
  logout() {
    persist(null)
  },
}

export function useSession() {
  return useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot)
}
