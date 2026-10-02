export const THEME_STORAGE_KEY = "seenow-theme"

export type Theme = "light" | "dark"

export function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark"
}

/** localStorage → prefers-color-scheme → light. Keep in sync with the script in index.html. */
export function resolveTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(stored)) return stored
  } catch {
    // Storage can throw in private mode; fall through to the system preference.
  }

  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark"
  return "light"
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
}

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore quota and private-mode failures; the class still updates for this visit.
  }
}
