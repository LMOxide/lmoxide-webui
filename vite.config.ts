import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development /api goes to lmoxide-api (tools/web-dev-backend.sh in the lmoxide repo), the
// same layout as production behind a reverse proxy. LMOXIDE_API points it elsewhere.
const apiTarget = process.env.LMOXIDE_API ?? 'http://127.0.0.1:8090'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    proxy: {
      '^/api/': { target: apiTarget, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
