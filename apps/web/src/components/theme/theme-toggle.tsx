import { MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme/use-theme"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"
  const label = isDark ? "Usar tema claro" : "Usar tema escuro"

  return (
    <Button type="button" variant="ghost" size="icon" onClick={toggleTheme} aria-label={label} title={label}>
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
