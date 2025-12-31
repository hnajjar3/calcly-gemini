# Calcly IDE Architecture

## 1. High-Level Overview

**Calcly IDE** is a browser-based Integrated Development Environment (IDE) designed for mathematical computation. It combines a traditional code editor and execution environment with a powerful AI Copilot to create a seamless and intuitive user experience.

### System Diagram

```mermaid
graph TD
    subgraph "User Interface"
        A[Monaco Code Editor]
        B[Command Window REPL]
        C[Equation Lab]
        D[Workspace Viewer]
        E[Plot Viewer]
    end

    subgraph "Browser Runtime (Client-Side)"
        F[Runtime Engine (lib/runtime.ts)]
        G[Variable Harvester]
        H[Plotting Library (Plotly.js)]
    end

    subgraph "AI Services (Google Gemini)"
        I[AI Copilot (services/geminiService.ts)]
    end

    A -- "Run Code" --> F
    B -- "Execute Command" --> F
    C -- "Insert Compiled JS" --> A
    F -- "Update Variables" --> G
    G -- "Display Variables" --> D
    F -- "Generate Plot" --> H
    H -- "Display Plot" --> E
    A -- "Send Code to AI" --> I
    I -- "Return Generated Code" --> A
```

---

## 2. Core Components

### 2.1 The Runtime Engine (`lib/runtime.ts`)

The Runtime Engine is the heart of the Calcly IDE. It is responsible for executing user-provided JavaScript code in a safe and isolated environment.

-   **Sandboxing**: Code is executed within an ephemeral `iframe` to prevent it from interfering with the main React application. This ensures that the IDE remains stable and responsive, even if the user's code contains errors or infinite loops.
-   **Variable Harvesting**: After each execution, the Runtime Engine scans the `iframe`'s window object to identify any user-defined variables. These variables are then extracted and displayed in the **Workspace Viewer**, providing the user with a real-time view of their code's state.
-   **State Persistence**: The Runtime Engine maintains the state of the user's session, including all defined variables and functions, until the page is refreshed. This allows users to build up complex calculations over time.

### 2.2 Equation Lab (`components/EquationEditor.tsx`)

The Equation Lab provides a bridge between traditional mathematical notation and executable code.

-   **Input**: Users can write equations using a visual LaTeX editor powered by MathLive.
-   **Compilation**: The Equation Lab uses the CortexJS Compute Engine to parse the LaTeX input and compile it into a native JavaScript function. For example, the equation `f(x) = x^2 + 2x + 1` would be compiled into a function that takes a single argument `x` and returns the result of the expression.
-   **Code Insertion**: Once the equation has been compiled, the user can insert the resulting JavaScript code directly into the Code Editor with a single click.

### 2.3 The AI Copilot (`services/geminiService.ts`)

The AI Copilot is an intelligent assistant that helps users write code, debug problems, and generate reports.

-   **Code Generation**: Users can provide natural language prompts to the AI Copilot, such as "Plot a sine wave from -PI to PI". The AI will then generate the corresponding JavaScript code and insert it into the Code Editor.
-   **Code Review**: The AI Copilot can analyze a user's code and provide suggestions for improvement. This includes identifying potential bugs, suggesting performance optimizations, and ensuring that the code adheres to best practices.
-   **Report Generation**: The AI Copilot can generate professional markdown reports from a user's code and results. This is a great way to document your work and share it with others.

---

## 3. Server & Deployment Architecture

### 3.1 Runtime Environment Injection

Calcly uses a clever strategy to inject environment variables at runtime, allowing the same Docker image to be used in different environments without modification.

-   **Problem**: Vite applications are typically built statically, meaning that environment variables are baked into the code at build time. This can be problematic when deploying the same application to multiple environments (e.g., development, staging, production) with different configurations.
-   **Solution**: The `server.js` file, which is an Express server, reads the `GEMINI_API_KEY` environment variable from the server's environment. It then injects this key into a `<script>` block in the `index.html` file, making it available to the client-side application as `window.GEMINI_API_KEY`.

### 3.2 Docker Strategy

The Calcly IDE is designed to be deployed as a Docker container.

-   **Base Image**: The Docker image is based on the `node:20-slim` image, which provides a lightweight and secure environment for running Node.js applications.
-   **Multi-stage Build**: The Dockerfile uses a multi-stage build to minimize the size of the final image. The first stage installs the dependencies and builds the application, while the second stage copies the build artifacts and the `server.js` file into a clean image.
-   **Security**: The application is run as a non-root user to improve security.

---

## 4. Technology Stack

-   **Framework**: React 19, Vite, TypeScript
-   **UI**: Tailwind CSS, Lucide Icons, `react-resizable-panels`
-   **Editor**: `@monaco-editor/react`
-   **Math**: `nerdamer` (Symbolic), `mathjs` (Numerical), `plotly.js` (Visualization)
-   **AI**: Google GenAI SDK (`@google/genai`)
