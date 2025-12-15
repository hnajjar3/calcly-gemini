
# Calcly - Open Source AI Computational Engine

Calcly is an **open-source**, AI-powered computational knowledge engine inspired by Wolfram Alpha. It leverages Google's Gemini models to solve complex math, physics, coding, and general knowledge queries, complete with symbolic computation and data visualizations.

## Features

- **Natural Language Solving**: Ask complex questions in plain English.
- **Symbolic Math Engine**: Dedicated interface for exact calculus, linear algebra, and symbolic manipulation using Nerdamer and Algebrite.
- **Data Visualization**: Auto-generated interactive charts for statistical data.
- **Multimodal Input**: Support for image analysis and voice queries.
- **Dual Mode**: Switch between **Pro** (Reasoning, Gemini 3) and **Flash** (Speed, Gemini 2.5).
- **Open Source**: Now available for the community to explore and extend.

## 🔗 Deep Linking & URL Parameters

Calcly supports deep linking, allowing you to create direct links to specific queries or tools. This is useful for sharing results or integrating with other workflows.

### Main Chat Interface
- **`q`**: The query text to execute immediately.
- **`mode`**: The model to use (`pro` or `flash`). Defaults to `pro` if unspecified.

**Examples:**
- `https://your-domain.com/?q=integrate+x^2`
- `https://your-domain.com/?q=explain+quantum+entanglement&mode=flash`

### Specific Tools
Use the `tool` parameter to route requests directly to specialized solvers.

- **Symbolic Solver**: `tool=symbolic`
  - `https://your-domain.com/?tool=symbolic&q=derivative+of+sin(x)`
  
- **Numerical Solver**: `tool=numerical`
  - `https://your-domain.com/?tool=numerical&q=mean([1,2,3,4])`

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- A Google Cloud Project or Google AI Studio account.

### 1. Installation

Clone the repository and install dependencies:

```bash
npm install
```

### 2. API Key Configuration

You need a Google Gemini API Key to run this application.

1. Get an API key from [Google AI Studio](https://aistudiocdn.com/app/apikey).
2. Create a file named `.env` in the root directory of the project.
3. Add your key to the file:

```env
API_KEY=your_gemini_api_key_starts_with_AIza...
```

**Demo Mode Fallback**: 
If you do not provide an `.env` file, the application is configured to run in **Demo Mode** using a placeholder key found in `services/geminiService.ts`. 
*Note: The default demo key is a placeholder (`AIzaSy_DEMO_KEY_PLACEHOLDER...`). You must replace it with a valid key for the app to function correctly.*

> **Security Note**: The `.env` file is git-ignored to prevent leaking your key. Do not commit it to version control.

### 3. Running Locally

**Development Mode (Recommended)**
This runs Vite with hot-reloading. The API key from your `.env` file is automatically injected.

```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

**Production Build Preview**
To test the actual server setup (which mimics the Cloud Run deployment):

```bash
npm run build
npm start
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## ☁️ Deployment (Google Cloud Run)

This application uses a **Runtime Environment Injection** strategy for deployment. This allows you to build the Docker image once and deploy it to different environments with different API keys.

1. **Deploy to Cloud Run** normally (via gcloud or console).
2. **Set the Environment Variable** in Cloud Run:
   - Go to your Cloud Run Service.
   - Click "Edit & Deploy New Revision".
   - Under "Variables & Secrets", add:
     - Name: `API_KEY`
     - Value: `[Your Actual Key]`
3. **Deploy**.

The `server.js` file automatically reads this environment variable and injects it into the React app when serving `index.html`.
