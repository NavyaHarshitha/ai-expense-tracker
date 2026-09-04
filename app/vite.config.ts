import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /*
    Vite 8 bundles with rolldown, so vendor grouping is advancedChunks rather
    than rollup's manualChunks.

    Split by change rate: React and the Firebase SDK are large and near-static,
    so once cached they survive every app deploy. Recharts lands in the
    Dashboard's own lazy chunk, since that is the only route importing it.
    */
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router)/ },
            { name: 'firebase', test: /node_modules[\\/]@?firebase/ },
          ],
        },
      },
    },
  },
  test: {
    // Pure functions - no DOM needed
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
