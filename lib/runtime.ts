import { v4 as uuidv4 } from 'uuid';
import * as math from 'mathjs';
import nerdamer from 'nerdamer/all.min';
import Algebrite from 'algebrite';
import { pyCalclyService } from '../src/services/pyCalclyService';

// Define the shape of our runtime context
interface RuntimeContext {
    console: {
        log: (...args: any[]) => void;
        error: (...args: any[]) => void;
        warn: (...args: any[]) => void;
    };
    plot: (data: any[], layout?: any, frames?: any[], config?: any) => void;
    math: typeof math;
    nerdamer: any;
    Algebrite: any;
    pycalcly: any;
    [key: string]: any; // Allow user variables
}

export interface ControlDef {
    min: number;
    max: number;
    value: number;
    step?: number;
    label?: string;
}

export interface Interaction {
    id: string;
    controls: Record<string, ControlDef>;
}

export type VariableValue = any;

export interface VariableMetadata {
    type: 'scalar' | 'array' | 'matrix' | 'symbolic' | 'other';
    sparkline?: number[]; // For arrays (max 50 points)
    heatmap?: {
        grid: number[][]; // Max 10x10
        min: number;
        max: number;
        rows: number;
        cols: number;
    };
    latex?: string; // For symbolic
    isConstant?: boolean; // For scalars
}

export interface Variable {
    name: string;
    value: VariableValue;
    type: string;
    metadata?: VariableMetadata;
}

export interface PlotData {
    id: string;
    data: any[];
    layout: any;
    frames?: any[]; // For animations
    config?: any;   // For plot configuration
    timestamp: number;
    interactionId?: string; // Link plot to interaction
}

export type LogType = 'log' | 'error' | 'warn' | 'info';

export interface LogEntry {
    id: string;
    type: LogType;
    message: string;
    timestamp: number;
}

class Runtime {
    private scope: Record<string, any> = {};
    private onPlot: (plot: PlotData) => void = () => { };
    private onLog: (entry: LogEntry) => void = () => { };
    private onVariablesUpdate: (variables: Variable[]) => void = () => { };
    private onInteract: (interaction: Interaction) => void = () => { };

    private interactionCallbacks: Record<string, Function> = {};

    constructor() {
        this.reset();
    }

    public setCallbacks(
        onPlot: (plot: PlotData) => void,
        onLog: (entry: LogEntry) => void,
        onVariablesUpdate: (variables: Variable[]) => void,
        onInteract: (interaction: Interaction) => void
    ) {
        this.onPlot = onPlot;
        this.onLog = onLog;
        this.onVariablesUpdate = onVariablesUpdate;
        this.onInteract = onInteract;
    }

    public updateInteraction(id: string, values: Record<string, number>) {
        const callback = this.interactionCallbacks[id];
        if (callback) {
            try {
                callback(values);
            } catch (e: any) {
                this.onLog({ id: uuidv4(), type: 'error', message: `Interaction Error: ${e.message}`, timestamp: Date.now() });
            }
        }
    }

    public reset() {
        this.scope = {};
        if (this.iframe) {
            document.body.removeChild(this.iframe);
            this.iframe = null;
        }
        this.initIframe();
        this.notifyVariables();
    }

    public deleteVariable(name: string) {
        if (!this.iframe) return;
        const win = this.iframe.contentWindow as any;
        try {
            // Try explicit delete (works for properties/var)
            delete win[name];
            // Also try setting to undefined (for let/const which can't be deleted but can be hidden)
            win.eval(`${name} = undefined`);
        } catch (e) { /* ignore */ }

        // Refresh
        this.harvestVariables(win, "");
    }

    private notifyVariables() {
        const vars: Variable[] = Object.entries(this.scope)
            .filter(([_, value]) => value !== undefined) // Filter out undefined (deleted)
            .map(([key, value]) => ({
                name: key,
                value: this.formatValue(value),
                type: this.getType(value),
                metadata: this.generateMetadata(value, key)
            }));
        this.onVariablesUpdate(vars);
    }

    private generateMetadata(value: any, name?: string): VariableMetadata {
        // 0. Function (JS Arrow or Standard) -> Symbolic
        if (typeof value === 'function') {
            try {
                let str = value.toString();
                let args = '';
                let body = '';

                // Arrow Function: (t) => ... or t => ...
                if (str.includes('=>')) {
                    const parts = str.split('=>');
                    args = parts[0].trim();
                    // Remove parentheses from args if needed (t) -> t
                    if (args.startsWith('(') && args.endsWith(')')) args = args.slice(1, -1);

                    body = parts.slice(1).join('=>').trim(); // Handle nested arrows poorly but good enough
                }
                // Standard Function: function(t) { return ... }
                else if (str.startsWith('function')) {
                    const argsMatch = str.match(/function\s*\(([^)]*)\)/);
                    if (argsMatch) args = argsMatch[1].trim();

                    const bodyMatch = str.match(/\{([\s\S]*)\}/);
                    if (bodyMatch) body = bodyMatch[1].trim();
                }

                // Cleanup Body
                if (body) {
                    // Remove block braces { return x } -> x
                    if (body.startsWith('{')) {
                        body = body.replace(/^{|}$/g, '').trim();
                        // Remove 'return' keyword
                        body = body.replace(/^return\s+/, '');
                        // Remove trailing semicolon
                        if (body.endsWith(';')) body = body.slice(0, -1);
                    }

                    // Remove 'Math.' prefix for cleaner parsing
                    // (Math.js handles some built-ins but 'Math.sin' might trip it up if not stripped)
                    body = body.replace(/Math\./g, '');

                    // Try converting to LaTeX using Math.js (standard lib, handles functions well)
                    try {
                        const node = math.parse(body);
                        const latexBody = node.toTex();
                        if (latexBody) {
                            const signature = name ? `${name}(${args})` : '';
                            return { type: 'symbolic', latex: signature ? `${signature} = ${latexBody}` : latexBody };
                        }
                    } catch (e) {
                        // Math.js failed? Try Nerdamer
                        try {
                            const latexBody = nerdamer.convertToLaTeX(body);
                            if (latexBody) {
                                const signature = name ? `${name}(${args})` : '';
                                return { type: 'symbolic', latex: signature ? `${signature} = ${latexBody}` : latexBody };
                            }
                        } catch (e2) {
                            // Fallback: just return the clean string
                            const signature = name ? `${name}(${args})` : '';
                            return { type: 'symbolic', latex: signature ? `${signature} = ${body}` : body };
                        }
                    }
                }
            } catch (e) { }
        }

        // 1. Matrix (Math.js)
        if (typeof value === 'object' && value !== null && value.isMatrix) {
            const size = value.size();
            const rows = size[0];
            const cols = size.length > 1 ? size[1] : 1;

            // Generate Heatmap (10x10 downsample)
            // This is a simplified "center-crop" or "stride" approach for speed
            const grid: number[][] = [];
            let min = Infinity;
            let max = -Infinity;

            // Try to extract a 10x10 preview
            const rStep = Math.max(1, Math.floor(rows / 10));
            const cStep = Math.max(1, Math.floor(cols / 10));

            for (let r = 0; r < Math.min(rows, 10 * rStep); r += rStep) {
                const row: number[] = [];
                for (let c = 0; c < Math.min(cols, 10 * cStep); c += cStep) {
                    // Math.js matrix access
                    // value.get([r, c]) might be slow in loop, use raw _data if available or standard api
                    try {
                        const val = value.get([r, c]);
                        if (typeof val === 'number') {
                            row.push(val);
                            if (val < min) min = val;
                            if (val > max) max = val;
                        } else {
                            row.push(0); // non-numeric
                        }
                    } catch (e) { row.push(0); }
                }
                grid.push(row);
            }

            return {
                type: 'matrix',
                heatmap: { grid, min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max, rows, cols }
            };
        }

        // 2. Array (Standard JS Array)
        if (Array.isArray(value)) {
            // Check if numeric array (heuristic: check first element)
            if (value.length > 0 && typeof value[0] === 'number') {
                // Downsample for Sparkline (Max 50 points)
                const sparkline: number[] = [];
                const step = Math.max(1, Math.floor(value.length / 50));

                for (let i = 0; i < value.length; i += step) {
                    sparkline.push(value[i]);
                }

                return {
                    type: 'array',
                    sparkline
                };
            }
            return { type: 'other' }; // Non-numeric array
        }

        // 3. Scalar (Number)
        if (typeof value === 'number') {
            return {
                type: 'scalar',
                isConstant: true
            };
        }

        // 4. Symbolic (Nerdamer object or Math String)
        // Heuristic: Check if it's a Nerdamer object or a string that looks like math
        try {
            // Check for Nerdamer Object
            if (value && typeof value === 'object' && (value.symbol || (value.toString().match(/[a-z]/i) && !value.isMatrix))) {
                return { type: 'symbolic', latex: nerdamer(value.toString()).toTeX() };
            }

            // Check for Math String (Algebrite output or raw string)
            if (typeof value === 'string') {
                // Heuristic: Contains math operators or functions?
                // Avoid plain text sentences.
                const mathHeuristic = /[+\-*/^=]|\b(sin|cos|tan|log|exp|sqrt|integral|diff)\b/;
                const looksLikeMath = mathHeuristic.test(value) && value.length < 200 && !value.includes(' ');

                if (looksLikeMath) {
                    try {
                        // Attempt to convert to LaTeX using Nerdamer
                        const latex = nerdamer.convertToLaTeX(value);
                        if (latex && latex.length > 0) {
                            return { type: 'symbolic', latex };
                        }
                    } catch (e) {
                        // Fallback: if nerdamer fails, just show raw string if it was Algebrite result
                        return { type: 'symbolic', latex: value };
                    }
                }
            }
        } catch (e) {
            // Heuristics failed, just treat as other
        }

        return { type: 'other' };
    }

    private getType(value: any): string {
        if (Array.isArray(value)) return `Array(${value.length})`;
        if (value === null) return 'null';
        if (typeof value === 'object' && value.isMatrix) return `Matrix(${value.size()})`;
        return typeof value;
    }

    private formatValue(value: any): any {
        if (typeof value === 'function') return '[Function]';
        if (typeof value === 'object' && value !== null) {
            if (value.isMatrix) return value.toString();
            if (Array.isArray(value)) {
                if (value.length > 10) return `[${value.slice(0, 3).join(', ')}, ... ${value.length - 3} more]`;
                return value;
            }
            return '{...}';
        }
        return value;
    }

    public async execute(code: string) {
        const safeLog = (type: LogType, ...args: any[]) => {
            let message = args.map(a => (typeof a === 'object' ? this.formatLogObject(a) : String(a))).join(' ');

            // Auto-convert fractions to decimals for better readability
            // Matches num/denom explicitly. simpler regex is safer for arrays.
            // e.g. [1/2, 3/4] -> [1/2 (= 0.5), 3/4 (= 0.75)]
            // e.g. [12345/67890] -> [0.1818] (large numbers replaced)
            const fractionRegex = /(-?\d+)\/(\d+)/g;
            message = message.replace(fractionRegex, (match, numStr, denomStr) => {
                try {
                    const num = parseInt(numStr);
                    const denom = parseInt(denomStr);
                    if (denom === 0) return match; // Avoid division by zero issues

                    const val = num / denom;

                    // Logic: If numbers are "large" (>= 4 digits), simply REPLACE with decimal to reduce noise.
                    // If numbers are small, keep them and APPEND decimal for clarity.
                    if (Math.abs(num) > 999 || denom > 999) {
                        // e.g. 12345/67890 -> 0.181838
                        return val.toPrecision(6).replace(/\.?0+$/, '');
                    }
                    // e.g. 1/3 -> 1/3 (= 0.333333)
                    return `${match} (= ${val.toPrecision(6).replace(/\.?0+$/, '')})`;
                } catch (e) {
                    return match;
                }
            });

            this.onLog({
                id: uuidv4(),
                type,
                message,
                timestamp: Date.now(),
            });
        };

        const plot = (data: any[], layout?: any, frames?: any[], config?: any) => {
            // Deep clone to detach from iframe context
            const safeData = JSON.parse(JSON.stringify(data));
            const safeLayout = JSON.parse(JSON.stringify(layout || {}));
            const safeFrames = frames ? JSON.parse(JSON.stringify(frames)) : undefined;
            const safeConfig = config ? JSON.parse(JSON.stringify(config)) : undefined;

            this.onPlot({
                id: uuidv4(),
                data: safeData,
                layout: safeLayout,
                frames: safeFrames,
                config: safeConfig,
                timestamp: Date.now(),
            });
        };

        try {
            return this.executeInIframe(code, plot, safeLog);
        } catch (err: any) {
            safeLog('error', err.message);
        }
    }

    private formatLogObject(a: any): string {
        try {
            // Handle Arrays specifically for cleaner output
            if (Array.isArray(a)) {
                if (a.length > 10) {
                    const firstFew = a.slice(0, 5).map(x => JSON.stringify(x)).join(', ');
                    const last = JSON.stringify(a[a.length - 1]);
                    return `[${firstFew}, ..., ${last}] (Array(${a.length}))`;
                }
            }
            // Handle TypedArrays (Math.js matrices often use them)
            if (a && a.buffer && a.length !== undefined) {
                if (a.length > 10) {
                    return `[TypedArray(${a.length})]`;
                }
            }

            return JSON.stringify(a);
        } catch (e) {
            return String(a);
        }
    }

    private iframe: HTMLIFrameElement | null = null;
    private initialKeys: Set<string> = new Set();

    private initIframe() {
        if (this.iframe) return;
        this.iframe = document.createElement('iframe');
        this.iframe.style.display = 'none';
        document.body.appendChild(this.iframe);
        const win = this.iframe.contentWindow as unknown as RuntimeContext;

        // Capture global errors
        win.addEventListener('error', (event: ErrorEvent) => {
            this.onLog({ id: uuidv4(), type: 'error', message: event.message, timestamp: Date.now() });
        });

        win.console = {
            log: (...args: any[]) => this.onLog({ id: uuidv4(), type: 'log', message: args.join(' '), timestamp: Date.now() }),
            error: (...args: any[]) => this.onLog({ id: uuidv4(), type: 'error', message: args.join(' '), timestamp: Date.now() }),
            warn: (...args: any[]) => this.onLog({ id: uuidv4(), type: 'warn', message: args.join(' '), timestamp: Date.now() }),
        };

        // Inject Libraries
        win.math = math;
        win.nerdamer = nerdamer;
        win.Algebrite = Algebrite;

        // Inject PyCalcly
        win.pycalcly = {
            sympy: {
                compute: (req: any) => pyCalclyService.compute(req),
                batch: (req: any) => pyCalclyService.batch(req)
            }
        };

        // Capture initial state
        this.initialKeys = new Set(Object.getOwnPropertyNames(win));
        for (const key in win) {
            this.initialKeys.add(key);
        }
    }

    private async executeInIframe(code: string, plot: any, safeLog: any) {
        if (!this.iframe) this.initIframe();
        const win = this.iframe!.contentWindow as any;

        // Hook for async harvest
        win.__harvest = (asyncCode?: string) => {
             // For async, we re-scan the *processed* code that was executed, or we scan the original?
             // Since we use exports in async wrapper, the variables should be in 'window' now.
             // But 'harvestVariables' logic for regex scan assumes declarations.
             // If we rely on exports, we just need to scan 'window' keys against initialKeys.
             this.harvestVariables(win, asyncCode || "");
        };

        // Define interact function in the iframe scope
        win.interact = (controls: Record<string, ControlDef>, callback: Function) => {
            const id = uuidv4();
            this.interactionCallbacks[id] = callback;

            // Notify UI to render controls
            this.onInteract({ id, controls });

            // Execute immediately with initial values to generate first plot
            // We need to extract initial values from the ControlDef
            const initialValues: Record<string, number> = {};
            for (const key in controls) {
                initialValues[key] = controls[key].value;
            }

            // Wrap the callback to inject the interaction ID into any plots generated
            // This is a bit tricky since 'plot' is global. We might need to set a context.
            // For now, simpler approach: The user calls plot inside the callback.
            // We can't easily adhere the ID to the plot unless we change win.plot dynamically.

            // Execute callback with initial values
            try {
                callback(initialValues);
            } catch (e: any) {
                safeLog('error', `Interaction Init Error: ${e.message}`);
            }
        };

        win.plot = plot;
        win.print = (...args: any[]) => safeLog('log', ...args);

        const processedCode = this.preprocessCode(code);

        try {
            // Use script tag injection to ensure let/const persist in global lexical scope
            const doc = this.iframe!.contentDocument!;
            const script = doc.createElement('script');
            script.textContent = processedCode;
            doc.body.appendChild(script);

            // Only synchronous harvest if NOT async wrapper (which calls __harvest itself)
            if (!code.includes('await')) {
                this.harvestVariables(win, processedCode);
            }
        } catch (e: any) {
            safeLog('error', e.toString());
        }
    }

    private preprocessCode(code: string): string {
        // 1. Convert class declarations to var expressions to allow redeclaration
        // class Foo {} -> var Foo = class Foo {}
        code = code.replace(/class\s+([a-zA-Z_$][\w$]*)/g, 'var $1 = class $1');

        // 2. Convert const/let to var to allow redeclaration, EXCEPT in for-loops
        // We want to preserve 'for (let i...' because that creates necessary closure scopes
        code = code.replace(/(for\s*\(\s*let\b)|(\b(const|let)\b)/g, (_match, forGroup, _varGroup) => {
            if (forGroup) return forGroup; // Keep 'for (let' as is
            return 'var'; // Replace other const/let with var
        });

        // 3. Async Wrapper Logic
        if (code.includes('await')) {
            // Extract variable names to export from the PROCESSED code (where const/let are now var)
            // We match 'var x' but NOT inside 'for (let x...)' because step 2 preserved 'let' there.
            const variableRegex = /(?:var)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/g;
            const varsToExport = new Set<string>();
            let match;
            while ((match = variableRegex.exec(code)) !== null) {
                varsToExport.add(match[1]);
            }

            const exportList = Array.from(varsToExport);

            // Generate export block: try { window['x'] = x; } catch(e){}
            const exports = exportList.map(v => `try { window['${v}'] = ${v}; } catch(e){}`).join(' ');

            // Add callback to notify runtime
            const notify = `if (window.__harvest) window.__harvest();`;

            code = `(async () => {
        try {
            ${code}
            ${exports}
            ${notify}
        } catch(e) {
            console.error(e);
        }
    })();`;
        }

        return code;
    }

    private harvestVariables(win: any, code: string) {
        const injected = new Set(['plot', 'print', 'math', 'nerdamer', 'Algebrite', 'console', 'interact', 'pycalcly', '__harvest']);
        const vars: Record<string, any> = {};
        const currentKeys = Object.getOwnPropertyNames(win);

        // 1. Capture Standard Globals (var, function, explicit window.x = ...)
        for (const key of currentKeys) {
            if (!this.initialKeys.has(key) && !injected.has(key) && win[key] !== win) {
                vars[key] = win[key];
            }
        }

        // 2. Capture Let/Const/Class from top-level code (Regex parsing)
        // Note: This is a best-effort parser for top-level declarations
        // In async wrapper mode, variables are already exported to window, so step 1 catches them.
        // But we keep this for sync mode logic.
        if (code) {
             const variableRegex = /(?:let|const|var|class|function)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/g;
             let match;
             while ((match = variableRegex.exec(code)) !== null) {
                 const name = match[1];
                 if (!injected.has(name) && !this.initialKeys.has(name)) {
                     try {
                         // We must evaluate to get the value because let/const are not on 'window'
                         // But since we converted to var (step 2), they might be on window if sync.
                         // If async wrapper, they are local unless exported.
                         // If exported, they are on window (Step 1).
                         // If local (e.g. inside loop), we can't access them anyway.

                         // Double check if we missed it in Step 1 (e.g. if it wasn't enumerable?)
                         if (!(name in vars)) {
                              const value = win.eval(name);
                              vars[name] = value;
                         }
                     } catch (e) {
                         // Ignore if undefined or not actually in scope
                     }
                 }
             }
        }

        this.scope = vars;
        this.notifyVariables();
    }
}

export const runtime = new Runtime();
