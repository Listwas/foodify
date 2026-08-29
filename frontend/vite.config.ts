import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Foodify — meal planner',
        short_name: 'Foodify',
        description: 'Plan dinners, swipe recipes, keep the grocery list in your pocket.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#ee6b33',
        background_color: '#14100f',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the recipe library is a static file the app cannot render without,
        // so it belongs in the precache alongside the code — that's what makes
        // the whole app work offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // the generate function must never be answered with the cached app shell
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // recipe photos are immutable and heavy — worth keeping offline
            urlPattern: /^https:\/\/www\.themealdb\.com\/images\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'meal-photos',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/live\.staticflickr\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'stock-photos',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // reachable from the lan
    host: true,
    port: 5173,
  },
  // There is no dev API to proxy to: everything but recipe generation runs in
  // the browser, and generation is a Cloudflare Pages Function. Under `vite
  // dev` that route simply isn't there, so the app reports AI as off — exactly
  // what a deployment without a key does. To exercise it locally, build and
  // serve through `npx wrangler pages dev frontend/dist`.
})
