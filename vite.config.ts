import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * Accept the variable names written by the Vercel ↔ Supabase integration as well as our own.
 * Only the PUBLIC url + anon/publishable key are ever mapped into the browser bundle —
 * the service-role key is never referenced here.
 */
function pick(env: Record<string, string>, names: string[]): string {
  for (const n of names) if (env[n]) return env[n];
  return '';
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>;
  const supabaseUrl = pick(env, ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']);
  const supabaseAnonKey = pick(env, [
    'VITE_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY'
  ]);

  return {
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey)
    },
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
  };
});
