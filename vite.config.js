import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    exclude: ['tests/behavior/**'],
    // Stub browser/extension globals unavailable in Node
    globals: false,
  },
  build: {
    outDir: 'dist',
    minify: true,
    // Keep bundle under 120KB per ADR-003
    rollupOptions: {
      output: {
        manualChunks: undefined,  // single bundle per entry — extension context
      },
    },
  },
  // Dev server serves the popup and options pages
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
})
