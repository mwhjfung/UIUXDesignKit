import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { pdkPrototypePlugin } from '@pdk/core/vite'

export default defineConfig({
  plugins: [tailwindcss(), vue(), pdkPrototypePlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
