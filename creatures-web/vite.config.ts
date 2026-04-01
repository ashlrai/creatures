import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? '/creatures/' : '/',
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split museum hall data into a separate chunk (~27K lines)
          'museum-data': [
            './src/data/halls/ancient-world.ts',
            './src/data/halls/medieval-world.ts',
            './src/data/halls/renaissance.ts',
            './src/data/halls/age-of-exploration.ts',
            './src/data/halls/modern-era.ts',
            './src/data/halls/twentieth-century.ts',
            './src/data/halls/scientific-revolution.ts',
            './src/data/halls/stars-and-cosmos.ts',
            './src/data/halls/elements-and-matter.ts',
            './src/data/halls/life-and-evolution.ts',
            './src/data/halls/index.ts',
          ],
          // Split Three.js into its own chunk
          'three': ['three'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Routes WITHOUT /api prefix on backend (experiments, evolution, etc.)
      '/api/experiments': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/export': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/neurons': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/morphology': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/god': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Routes WITH /api prefix on backend (consciousness, metrics, ecosystem, etc.)
      '/api/consciousness': {
        target: 'http://localhost:8000',
      },
      '/api/metrics': {
        target: 'http://localhost:8000',
      },
      '/api/analysis': {
        target: 'http://localhost:8000',
      },
      '/api/ecosystem': {
        target: 'http://localhost:8000',
      },
      '/api/pharmacology': {
        target: 'http://localhost:8000',
      },
      '/api/history': {
        target: 'http://localhost:8000',
      },
      // Evolution (no /api prefix)
      '/evolution': {
        target: 'http://localhost:8000',
      },
      // WebSocket
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
