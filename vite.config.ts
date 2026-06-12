import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // The worker is loaded as a URL via `?url` in src/pdf/worker.ts.
    // Pre-bundling it confuses Vite's dep optimizer (it tries to wrap a
    // worker module as a regular ESM dep).
    exclude: ['pdfjs-dist/build/pdf.worker.min.mjs'],
  },
})
