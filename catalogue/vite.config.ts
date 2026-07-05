import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { prototypesApi, serveTooling } from './vite-plugins'

export default defineConfig({
  plugins: [tailwindcss(), vue(), serveTooling(), prototypesApi()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
