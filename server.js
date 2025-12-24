import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Cloud Run expects the app to listen on 0.0.0.0, not localhost
const PORT = process.env.PORT || 8080;

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
    const apiKey = process.env.API_KEY || '';
    
    // Inject directly into the pre-defined process shim in index.html
    // We assume window.process.env already exists from index.html's base script
    const envScript = `<script>if (window.process && window.process.env) { window.process.env.API_KEY = "${apiKey}"; }</script>`;
    const injectedHtml = htmlData.replace('<!--ENV_INJECTION-->', envScript);

    res.send(injectedHtml);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});