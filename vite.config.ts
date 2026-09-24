import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/mouse-pupillometry-benchmark/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
})
