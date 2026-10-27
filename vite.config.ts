import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // DEMO=1 uses a separate local database (seeded with mock cards) for screenshots and trying the app.
    cloudflare({ persistState: process.env.DEMO ? { path: '.wrangler/demo' } : true }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Nihongo Coach',
        short_name: '日本語',
        lang: 'zh-TW',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#e11d48',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  resolve: { alias: { '@shared': '/shared' } },
})
