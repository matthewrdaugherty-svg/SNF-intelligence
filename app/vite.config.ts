import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'

// A fingerprint of everything in public/data, added to every data URL (?v=...). The data files keep their names between releases and are cached by browsers,
// so without this a returning visitor could run new code against an old cached file. The fingerprint only changes when the data does, so unchanged data stays cached.
const dataDir = join(import.meta.dirname, 'public', 'data')
const dataVersion = (() => { const h = createHash('sha1'); for (const f of readdirSync(dataDir).sort()) { h.update(f); h.update(readFileSync(join(dataDir, f))) } return h.digest('hex').slice(0, 12) })()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __DATA_VERSION__: JSON.stringify(dataVersion) },
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  build: { target: 'esnext' },
  worker: { format: 'es' },
})
