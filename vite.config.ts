import { vlyPlugin } from "@vly-ai/integrations";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, type Plugin } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // Exponer también V1/V2/V3 (variables personalizadas del tab Keys) en
  // import.meta.env además del prefijo estándar VITE_.
  envPrefix: ["VITE_", "V1", "V2", "V3"],
  plugins: [vlyPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Mantiene una sola copia de React entre las dependencias de la aplicación.
    dedupe: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  },
  build: {
    // El publicador de producción copia el cliente desde `dist/public`.
    // El bundle del servidor se mantiene en `dist/index.js`.
    outDir: "dist/public",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'radix-ui': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-label',
            '@radix-ui/react-menubar',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-tooltip',
          ],
          'framer-motion': ['framer-motion'],
          'charts': ['recharts'],
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1000,
    target: 'esnext',
    minify: 'esbuild',
  },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-router',
      '@tanstack/react-query',
      'framer-motion',
    ],
  },
  server: {
    host: true,
    port: 5173,
    // Las vistas previas se exponen mediante subdominios temporales seguros.
    // Aceptar exclusivamente los dominios de Manus evita el bloqueo de Host
    // sin abrir el dev server a hosts arbitrarios.
    allowedHosts: [".manus.computer", ".manus.space"],
    hmr: {
      overlay: false,
    },
    // Proxy del dev server a la Management API de Supabase.
    // La Management API solo permite CORS desde supabase.com; al enrutarla por
    // el dev server (mismo origen), la app puede crear el esquema pegando solo
    // el token sbp_… sin necesidad del SQL Editor. En producción (build
    // estático) no aplica; ahí se usa la ruta directa o el SQL manual.
    proxy: {
      "/__supabase-mgmt": {
        target: "https://api.supabase.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/__supabase-mgmt/, "/v1"),
      },
    },
  },
});
