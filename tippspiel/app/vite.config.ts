import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { importScripts: ['push-sw.js'], navigateFallbackDenylist: [/^\/functions/] },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'TippArena – Tippspiel mit Spielgeld',
        short_name: 'TippArena',
        description: 'Sport-Tippspiel mit Spielgeld. Kein Glücksspiel – nur Spielgeld, keine Gewinne in Geld.',
        lang: 'de',
        theme_color: '#050608',
        background_color: '#050608',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
