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
      injectRegister: false,
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Driver Buddy',
        short_name: 'Driver Buddy',
        id: '/',
        description: 'Free tax tracker for UK gig-economy drivers. Track shifts, mileage, expenses and your HMRC tax estimate - offline, no account needed.',
        lang: 'en-GB',
        dir: 'ltr',
        theme_color: '#1e40af',
        background_color: '#0f172a',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['finance', 'business', 'productivity', 'utilities'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          {
            src: '/screenshots/dashboard-wide.png',
            sizes: '1365x768',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Driver Buddy dashboard on desktop',
          },
          {
            src: '/screenshots/tax-pack-section.png',
            sizes: '375x812',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Tax estimate and HMRC-ready summary',
          },
          {
            src: '/screenshots/prediction-card.png',
            sizes: '375x812',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Driver earnings forecast',
          },
          {
            src: '/screenshots/settings-your-data.png',
            sizes: '375x812',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Privacy and data controls',
          },
        ],
        shortcuts: [
          {
            name: 'Start shift',
            short_name: 'Start',
            description: 'Open the shift timer.',
            url: '/?action=start-shift',
            icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Add expense',
            short_name: 'Expense',
            description: 'Open the expense form.',
            url: '/?action=add-expense',
            icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Add trip',
            short_name: 'Trip',
            description: 'Open the mileage form.',
            url: '/?action=add-trip',
            icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Tax estimate',
            short_name: 'Tax',
            description: 'Open your tax estimate.',
            url: '/?action=tax',
            icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
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
    host: 'localhost',
  },
  build: {
    target: 'esnext',
    minify: true,
    sourcemap: process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const norm = id.replace(/\\/g, '/');
          if (
            norm.includes('node_modules/react/') ||
            norm.includes('node_modules/react-dom/') ||
            norm.includes('node_modules/scheduler/')
          ) {
            return 'vendor';
          }
          if (norm.includes('node_modules/lucide-react/')) {
            return 'icons';
          }
          if (norm.includes('node_modules/@sentry/')) {
            return 'sentry';
          }
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
