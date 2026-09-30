import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/outfit"
import "@fontsource-variable/newsreader/wght.css"
import "@fontsource-variable/newsreader/wght-italic.css"
import "./index.css"
import { App } from "./App.tsx"
import { studioDb } from "@/lib/db"

void studioDb.init()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
