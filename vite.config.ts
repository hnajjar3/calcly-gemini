import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'html-env-injection',
        transformIndexHtml(html) {
          // During development (npm run dev), inject the key from .env file immediately
          if (mode === 'development') {
             const script = `<script>if (window.process && window.process.env) { window.process.env.API_KEY = "${env.API_KEY || ''}"; }</script>`;
             return html.replace('<!--ENV_INJECTION-->', script);
          }
          // During build/production, leave placeholder or inject empty default
          // The server.js will handle the actual injection at runtime.
          return html;
        }
      }
    ],
    // We remove the 'define' block because we are using window.env injection strategy
    // which is safer for runtime variables in Docker containers
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    }
  };
});