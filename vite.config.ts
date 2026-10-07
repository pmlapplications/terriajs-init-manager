import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // API server from `npm run dev:api`.
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
})
