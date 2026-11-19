import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { localServerPlugin } from './src/server/localServerPlugin';

export default defineConfig({
  plugins: [
    localServerPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Hội Thi Hát - Bình Chọn & Chấm Điểm',
        short_name: 'Hội Thi Hát',
        description: 'Ứng dụng bình chọn và chấm điểm hội thi văn nghệ trực tiếp',
        theme_color: '#be123c',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'xlsx-vendor': ['xlsx'],
        },
      },
    },
  },
});
