import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // SSE passes through http-proxy unbuffered; no special config needed.
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
