import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    // Older Android WebViews (Median APK) — ships an ES5 fallback bundle
    legacy({ targets: ['defaults', 'Android >= 7', 'Chrome >= 64'] }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'توصيل فرش — FreshDash Pro',
        short_name: 'توصيل فرش',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f7f2',
        theme_color: '#1b5e20',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        runtimeCaching: [
          {
            // Product images from Supabase Storage (public bucket)
            urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'product-images', expiration: { maxEntries: 150, maxAgeSeconds: 604800 } }
          }
          // REST / RPC / Auth are intentionally NOT cached by the service worker.
        ]
      }
    })
  ],
  build: { target: 'es2020', sourcemap: true },
  test: { environment: 'node' }
});
