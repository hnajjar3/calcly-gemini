import { v4 as uuidv4 } from 'uuid';
import * as math from 'mathjs';
import nerdamer from 'nerdamer/all.min';
import Algebrite from 'algebrite';

// Define the shape of our runtime context
interface RuntimeContext {
    console: {
        log: (...args: any[]) => void;
        error: (...args: any[]) => void;
        warn: (...args: any[]) => void;
    };
    plot: (data: any[], layout?: any) => void;
    math: typeof math;
    nerdamer: any;
    Algebrite: any;
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

export interface Variable {
    name: string;
    value: VariableValue;
    type: string;
}

export interface PlotData {
    id: string;
    data: any[];
    layout: any;
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
            }));
        this.onVariablesUpdate(vars);
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
            this.onLog({
                id: uuidv4(),
                type,
                message: args.map(a => (typeof a === 'object' ? this.formatLogObject(a) : String(a))).join(' '),
                timestamp: Date.now(),
            });
        };

        const plot = (data: any[], layout?: any) => {
            // Deep clone to detach from iframe context
            const safeData = JSON.parse(JSON.stringify(data));
            const safeLayout = JSON.parse(JSON.stringify(layout || {}));

            this.onPlot({
                id: uuidv4(),
                data: safeData,
                layout: safeLayout,
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

        // Capture initial state
        this.initialKeys = new Set(Object.getOwnPropertyNames(win));
        for (const key in win) {
            this.initialKeys.add(key);
        }
    }

    private async executeInIframe(code: string, plot: any, safeLog: any) {
        if (!this.iframe) this.initIframe();
        const win = this.iframe!.contentWindow as any;

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

            this.harvestVariables(win, processedCode);
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
        return code.replace(/(for\s*\(\s*let\b)|(\b(const|let)\b)/g, (_match, forGroup, _varGroup) => {
            if (forGroup) return forGroup; // Keep 'for (let' as is
            return 'var'; // Replace other const/let with var
        });
    }

    private harvestVariables(win: any, code: string) {
        const injected = new Set(['plot', 'print', 'math', 'nerdamer', 'Algebrite', 'console', 'interact']);
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
        const variableRegex = /(?:let|const|var|class|function)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/g;
        let match;
        while ((match = variableRegex.exec(code)) !== null) {
            const name = match[1];
            if (!injected.has(name) && !this.initialKeys.has(name)) {
                try {
                    // We must evaluate to get the value because let/const are not on 'window'
                    const value = win.eval(name);
                    vars[name] = value;
                } catch (e) {
                    // Ignore if undefined or not actually in scope
                }
            }
        }

        this.scope = vars;
        this.notifyVariables();
    }
}

export const runtime = new Runtime();
