import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [
      react(),
      {
        name: 'html-env-injection',
        transformIndexHtml(html) {
          // Inject the env variables into the HTML during local development
          const envScript = `<script>window.env = ${JSON.stringify(env)};</script>`;
          return html.replace('<!--ENV_INJECTION-->', envScript);
        }
      }
    ],
    define: {
      // Alias process.env to window.env globally (only map specific keys to avoid overwriting node internals)
      'process.env.API_KEY': 'window.env.API_KEY',
      'process.env.GEMINI_API_KEY': 'window.env.GEMINI_API_KEY'
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './setupTests.ts',
      css: true,
    }
  };
});