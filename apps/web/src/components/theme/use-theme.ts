import { useContext } from "react"
import { ThemeContext } from "@/components/theme/theme-context"

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error("useTheme deve ser usado dentro de ThemeProvider.")
  return value
}
