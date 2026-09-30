import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { seenowAiPlugin } from './vite-plugin-ai.ts'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss(), seenowAiPlugin()],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
    },
  },
  server: {
    host: true,
    port: 4317,
    strictPort: true,
  },
})
