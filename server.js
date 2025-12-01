import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Cloud Run requires binding to 0.0.0.0 (env.PORT usually provided)
const PORT = process.env.PORT || 8080;

// Log startup environment status (Don't log the actual key value for security)
console.log("Starting server...");
console.log("Environment API_KEY present:", !!process.env.API_KEY);
console.log("Environment GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle SPA routing: serve index.html for all other routes
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  
  // Read index.html
  fs.readFile(indexPath, 'utf8', (err, htmlData) => {
    if (err) {
      console.error('Error reading index.html', err);
      return res.status(500).send('Error loading app');
    }

    // Prepare runtime environment variables
    // We strictly select keys we want to expose to the client
    const runtimeEnv = {
      API_KEY: process.env.API_KEY || process.env.GEMINI_API_KEY,
    };

    // Inject env vars into the HTML placeholder
    // This script runs before the app loads, populating window.env
    const injectedHtml = htmlData.replace(
      '<!--ENV_INJECTION-->',
      `<script>window.env = ${JSON.stringify(runtimeEnv)};</script>`
    );

    res.send(injectedHtml);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});