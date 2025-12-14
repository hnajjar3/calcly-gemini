# Calcly - AI Computational Engine

Calcly is an AI-powered computational knowledge engine inspired by Wolfram Alpha. It leverages Google's Gemini models to solve complex math, physics, coding, and general knowledge queries, complete with symbolic computation and data visualizations.

## Features

- **Natural Language Solving**: Ask complex questions in plain English.
- **Symbolic Math Engine**: Dedicated interface for exact calculus, linear algebra, and symbolic manipulation using Nerdamer and Algebrite.
- **Data Visualization**: Auto-generated interactive charts for statistical data.
- **Multimodal Input**: Support for image analysis and voice queries.
- **Dual Mode**: Switch between **Pro** (Reasoning, Gemini 3) and **Flash** (Speed, Gemini 2.5).

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
