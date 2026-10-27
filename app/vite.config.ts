import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  build: { target: 'esnext' },
  worker: { format: 'es' },
})
