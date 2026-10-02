import { useMemo, useState, type ReactNode } from "react"
import { ThemeContext, type ThemeContextValue } from "@/components/theme/theme-context"
import { applyTheme, persistTheme, resolveTheme, type Theme } from "@/lib/theme"

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = resolveTheme()
    applyTheme(initial)
    return initial
  })

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme(next) {
        persistTheme(next)
        applyTheme(next)
        setThemeState(next)
      },
      toggleTheme() {
        setThemeState((current) => {
          const next = current === "dark" ? "light" : "dark"
          persistTheme(next)
          applyTheme(next)
          return next
        })
      },
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
