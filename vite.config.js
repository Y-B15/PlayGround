import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 3002 },
  build: { target: 'es2020', assetsInlineLimit: 0 },
})
