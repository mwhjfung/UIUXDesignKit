import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pdkPrototypePlugin } from '@pdk/core/vite'

export default defineConfig({
  plugins: [react(), pdkPrototypePlugin()],
})
