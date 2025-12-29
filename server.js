import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
// Cloud Run expects the app to listen on 0.0.0.0, not localhost
const PORT = process.env.PORT || 8080;

// Retrieve the API Key for server-side injection
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

// Proxy /api-proxy requests to Google Gemini API
app.use('/api-proxy', createProxyMiddleware({
  target: 'https://generativelanguage.googleapis.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api-proxy': '' // Remove /api-proxy prefix when forwarding
  },
  onProxyReq: (proxyReq, req, res) => {
    // Server-side Injection: Append the API Key to the upstream request query parameters
    // This ensures authentication works even if the client-side injection fails on custom domains
    if (GEMINI_API_KEY) {
      // Check if the path already has query parameters
      const separator = proxyReq.path.includes('?') ? '&' : '?';
      // Append the key parameter (Google API expects 'key')
      proxyReq.path = proxyReq.path + separator + 'key=' + GEMINI_API_KEY;
    }
  }
}));

// Serve static files from the build directory
// We explicitly exclude index.html from static serving so we can intercept and inject env vars
app.use(express.static(path.join(__dirname, 'dist'), { index: false }));

// Handle SPA routing: serve index.html for all routes, injecting the API Key
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');

  fs.readFile(indexPath, 'utf8', (err, htmlData) => {
    if (err) {
      console.error('Error reading index.html', err);
      return res.status(500).send('Error loading app');
    }

    // Runtime Injection: Get the API key from Cloud Run environment variables
    // Support both GEMINI_API_KEY (specific) and API_KEY (generic)
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

    // Inject directly as a window global to avoid Vite build-time replacement issues with process.env
    const envScript = `<script>
      window.GEMINI_API_KEY = "${apiKey}"; 
      if (!window.process) window.process = { env: {} };
      window.process.env.API_KEY = "${apiKey}";
      window.process.env.GEMINI_API_KEY = "${apiKey}";
    </script>`;
    const injectedHtml = htmlData.replace('<!--ENV_INJECTION-->', envScript);

    res.send(injectedHtml);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});