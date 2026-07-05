import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { pdkPrototypePlugin } from '@pdk/core/vite'

export default defineConfig({
  plugins: [tailwindcss(), react(), pdkPrototypePlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
