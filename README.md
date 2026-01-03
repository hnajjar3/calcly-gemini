# Calcly IDE

# Calcly IDE

**The AI-First Math Engine for the Modern Web.**

Calcly is a modern, React-based numerical and symbolic math solver designed for the modern user. It reimagines the computational experience by putting **AI First**, while giving you the full power of an **IDE** to review, edit, and understand the code before it runs.

## 💡 The Vision

We believe powerful tools shouldn't require powerful hardware or complex setups.

-   **Any Device, Anywhere**: Whether you are on a high-end workstation, a **Chromebook**, or an **iPad**, Calcly delivers a full desktop-class coding environment right in your browser. No installations. No config hell. Just open the link and solve.
-   **AI with Oversight**: Chatbots are great, but can you trust their math? Calcly solves this by treating AI as a *drafting tool*. The AI writes the script, but **you** sit in the pilot's seat—reviewing the code in the editor, making tweaks, and executing it only when you're ready.
-   **Numerical & Symbolic Power**: Seamlessly switch between exact symbolic algebra (like simplifying equations) and heavy numerical crunching (like processing datasets), all within a reactive, modern interface.

## 🌟 Key Features

### 1. The Workbench
-   **Code Editor**: Monaco-based editor (VS Code engine) with syntax highlighting and auto-completion.
-   **Command Window**: READ-EVAL-PRINT-LOOP (REPL) for quick calculations (`>> 1 + 1`).
-   **Workspace Viewer**: Real-time inspection of all active variables (scalars, arrays, objects).
-   **Plot Viewer**: Dedicated tab for interactive Plotly charts generated from your code.

### 2. The Python Engine (PyCalcly)
-   **Python in the Browser**: Leverages **Pyodide** (WebAssembly) to run a full Python environment directly in your browser.
-   **SymPy Integration**: Provides access to the powerful **SymPy** library for robust symbolic mathematics (calculus, algebra, discrete math).
-   **Future-Ready**: Built to eventually abstract the entire Python scientific ecosystem (NumPy, SciPy) for web use.
-   **Usage**: Access it via the global `pycalcly` object (e.g., `pycalcly.sympy.compute({...})`).

### 3. Equation Lab
-   **Visual Math**: Type equations using a visual LaTeX editor (MathLive).
-   **Native Compilation**: Uses **CortexJS Compute Engine** to compile math formulas directly into executable JavaScript code.
-   **One-Click Insert**: seamless injection of math logic into your scripts.

### 4. AI Copilot
-   **Natural Language Coding**: Ask the AI: *"Generate a 3D surface plot of a damped sine wave"* and watch it write the code.
-   **Code Review**: One-click auditing of your scripts for bugs and optimizations.
-   **Scientific Publishing**: One-click generation of professional markdown reports from your code and results.

### 5. Hybrid Math Engine
-   **Numerical**: Powered by `math.js`.
-   **Symbolic**: Powered by **PyCalcly (SymPy)** for industrial-strength symbolic computation.
-   **Auto Mode**: The AI intelligently routes tasks to the best engine.

---

## 🚀 Getting Started

### Prerequisites
-   Node.js v18+
-   Google Gemini API Key

### Installation

1.  **Clone the repo**
    ```bash
    git clone https://github.com/yourusername/calcly-ide.git
    cd calcly-ide
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Configure API Key**
    Create a `.env` file in the root:
    ```env
    API_KEY=your_gemini_api_key_here
    # Optional: Use specific key variable
    GEMINI_API_KEY=your_gemini_api_key_here
    ```

4.  **Run Locally**
    ```bash
    npm run dev
    ```
    Access at `http://localhost:5173`.

---

## ☁️ Production Deployment

Calcly is designed for containerized deployment (e.g., Google Cloud Run).

### Docker Build
```bash
docker build -t calcly-ide .
docker run -p 8080:8080 -e GEMINI_API_KEY=your_key calcly-ide
```

### Runtime Environment Injection
Calcly uses a robust injection strategy to support "Build Once, Deploy Anywhere":
1.  **Server-Side**: `server.js` reads `GEMINI_API_KEY` (or `API_KEY`) from the container environment.
2.  **Injection**: It injects this key into a global `window.GEMINI_API_KEY` variable in `index.html` at runtime.
3.  **Client-Side**: The app prioritizes this global variable, bypassing any build-time hardcoded values.

---

## 📖 User Guide

For a detailed walkthrough of all features, please see the [User Guide](./USER_GUIDE.md).

## 🛠️ Architecture

For a deep dive into the technical architecture, see the [Architecture](./ARCHITECTURE.md) documentation.

## 🔗 External Integrations

### Auto-Start Query URL
You can trigger the AI Copilot automatically by passing a query parameter to the application URL. This allows external tools or shortcuts to open Calcly and immediately start solving a problem.

**URL Pattern:**
`https://app.calcly.ai/?chat_query=YOUR_QUERY_HERE`

**Example:**
[Open Calcly and Solve PI](https://app.calcly.ai/?chat_query=Write+a+program+to+calculate+pi+using+Monte+Carlo)

*Note: The URL parameter is automatically cleared from the address bar after the request is submitted to prevent re-submission on page reload.*

## License
MIT
