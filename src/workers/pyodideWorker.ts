/// <reference lib="webworker" />

// Define types for Pyodide
interface PyodideInterface {
    loadPackage: (packages: string | string[]) => Promise<void>;
    runPythonAsync: (code: string) => Promise<any>;
    runPython: (code: string) => any;
    globals: any;
    FS: any;
}

declare function loadPyodide(config: any): Promise<PyodideInterface>;

// Import script for Pyodide (standard way in workers)
importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');

let pyodide: PyodideInterface | null = null;
let engineReady = false;

// Engine source code placeholder (we will fetch it or bundle it)
// Ideally, we fetch the python file. For simplicity in this setup,
// we will fetch it from the src/python/engine.py location if served,
// or we can embed it.
// Since we are in Vite dev mode, we can try to fetch it.
// However, 'src' might not be served publicly.
// STRATEGY: We will fetch the file content via the main thread or assume it's bundled.
// BETTER STRATEGY: The service sends the python code as part of initialization?
// OR: We just hardcode the python code here? No, that's messy.
// BEST: Vite can import the file as a raw string.
// But we are in a worker file.
// Let's assume the main thread sends the python source code during initialization.

const initPyodide = async (pythonSource: string) => {
    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/"
        });

        await pyodide.loadPackage(["sympy", "micropip"]);

        const micropip = pyodide.globals.get("micropip");
        await micropip.install("pydantic");

        // Write the engine file to the virtual filesystem
        pyodide.FS.mkdir('/src');
        pyodide.FS.mkdir('/src/python');
        pyodide.FS.writeFile('/src/python/engine.py', pythonSource);

        // Import the engine
        await pyodide.runPythonAsync(`
            import sys
            sys.path.append('/src/python')
            from engine import get_engine, ComputeRequest, BatchRequest
            import json

            engine = get_engine()
        `);

        engineReady = true;
        self.postMessage({ type: 'READY' });
    } catch (error: any) {
        self.postMessage({ type: 'ERROR', error: error.message });
    }
};

self.onmessage = async (event) => {
    const { type, payload, id } = event.data;

    if (type === 'INIT') {
        await initPyodide(payload.pythonSource);
        return;
    }

    if (!engineReady || !pyodide) {
        self.postMessage({ type: 'ERROR', id, error: 'Engine not ready' });
        return;
    }

    try {
        if (type === 'COMPUTE') {
            // We pass data as JSON string to avoid Pyodide conversion issues with complex objects
            const reqJson = JSON.stringify(payload);
            const pythonCode = `
                req_data = json.loads('${reqJson}')
                # Validate using Pydantic (optional but good)
                # req = ComputeRequest(**req_data)
                # But to save try/catch block here, we just pass dict if pydantic is annoying
                # Actually, engine expects ComputeRequest object if we typed it so.
                # Let's construct it.
                try:
                    req = ComputeRequest(**req_data)
                    res = engine.compute(req)
                    json.dumps(res.dict()) # Return JSON string
                except Exception as e:
                    json.dumps({"error": str(e), "is_error": True})
            `;
            const resultJson = await pyodide.runPythonAsync(pythonCode);
            const result = JSON.parse(resultJson);

            if (result.is_error) {
                 self.postMessage({ type: 'ERROR', id, error: result.error });
            } else {
                 self.postMessage({ type: 'RESULT', id, result });
            }
        }
        else if (type === 'BATCH') {
            const reqJson = JSON.stringify(payload);
            const pythonCode = `
                req_data = json.loads('${reqJson}')
                try:
                    req = BatchRequest(**req_data)
                    res = engine.batch(req)
                    json.dumps(res) # res is already a list of dicts
                except Exception as e:
                    json.dumps({"error": str(e), "is_error": True})
            `;
            const resultJson = await pyodide.runPythonAsync(pythonCode);
             const result = JSON.parse(resultJson);

            if (result.is_error) {
                 self.postMessage({ type: 'ERROR', id, error: result.error });
            } else {
                 self.postMessage({ type: 'RESULT', id, result });
            }
        }
    } catch (error: any) {
        self.postMessage({ type: 'ERROR', id, error: error.message });
    }
};
