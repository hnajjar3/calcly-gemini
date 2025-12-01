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
          // Inject the env variables into the HTML during local development
          // This simulates what server.js does in production
          const envScript = `<script>window.env = ${JSON.stringify(env)};</script>`;
          return html.replace('<!--ENV_INJECTION-->', envScript);
        }
      }
    ],
    define: {
      // Alias process.env to window.env globally
      // This allows 'process.env.API_KEY' in code to work by reading from 'window.env.API_KEY'
      'process.env': 'window.env'
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    }
  };
});