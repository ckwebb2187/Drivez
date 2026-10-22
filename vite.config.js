import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      output: {
        // Big libraries in their own files: they change rarely, so phones keep them cached across updates.
        manualChunks(id) {
          // Only libraries that either load later anyway or don't need React when they start.
          // (Splitting React-based libraries into startup files makes them run before React is ready.)
          // React itself and Rollup's tiny helpers: a leaf file every other file can share safely.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id) || (id.startsWith('\0') && !/leaflet|qrcode|recharts|three|maplibre/.test(id))) return 'react';
          if (id.includes('leaflet')) return 'leaflet'; // incl. the maplibre-gl-leaflet plugin
          if (id.includes('maplibre-gl')) return 'maplibre';
          if (id.includes('/three/')) return 'three';
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('qrcode')) return 'qrcode';
          return undefined;
        },
      },
    },
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
