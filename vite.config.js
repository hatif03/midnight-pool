import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  // The compiled Midnight contract's onchain-runtime dependency ships a raw ESM `.wasm` import
  // (wasm-bindgen output) -- Vite's built-in wasm handling only covers `?init`/`?url` suffixed
  // imports, not that form, so it needs this plugin (see docs/adr/0006). This Vite version
  // (Rolldown-based) doesn't need vite-plugin-top-level-await alongside it -- that plugin's own
  // esbuild dependency isn't installed/needed here, and top-level await already works without it.
  plugins: [
    wasm(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      includeAssets: ['logo-source.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'],
      manifest: {
        name: 'Midnight Pool',
        short_name: 'Pool',
        description: 'A 2D pool game with peer-to-peer 1v1 multiplayer.',
        start_url: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#04080a',
        theme_color: '#04080a',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ogg}'],
      },
    }),
  ],
});
