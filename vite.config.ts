import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const asPluginOption = (plugin: unknown): PluginOption => plugin as PluginOption;
const plugins: PluginOption[] = [
  // Some installed plugins resolve through a symlinked dependency tree, so normalize them to the local Vite plugin type.
  asPluginOption(react()),
  asPluginOption(tailwindcss()),
];

if (process.env.DISABLE_PWA !== 'true') {
  plugins.push(
    asPluginOption(VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'DriverTax Pro',
        short_name: 'DriverTax',
        description: 'HMRC-compliant mileage and expense tracker for UK self-employed drivers',
        theme_color: '#1e40af',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true,
      },
    }))
  );
}

if (process.env.SENTRY_AUTH_TOKEN) {
  if (process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
    try {
      const sentryPluginModuleName = '@sentry/vite-plugin';
      const sentryModule = (await import(sentryPluginModuleName)) as {
        sentryVitePlugin: (options: { authToken: string; org: string; project: string }) => unknown;
      };

      plugins.push(
        asPluginOption(
          sentryModule.sentryVitePlugin({
            authToken: process.env.SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
          })
        )
      );
    } catch (error) {
      console.warn('Sentry source map upload is disabled because @sentry/vite-plugin is unavailable.', error);
    }
  } else {
    console.warn('Sentry source map upload is disabled because SENTRY_ORG or SENTRY_PROJECT is missing.');
  }
}

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    target: 'esnext',
    minify: true,
    sourcemap: process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  plugins,
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
