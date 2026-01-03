import { v4 as uuidv4 } from 'uuid';
import engineSource from '../python/engine.py?raw'; // Vite specific: import as raw string

// Define Types mirroring Python Pydantic models
export interface ComputeRequest {
    expr: string;
    task: string;
    var?: string;
    subs?: Record<string, number>;
    solve_for?: string;
    timeout_sec?: number;
    series_order?: number;
    kwargs?: Record<string, any>;
    args?: any[];
}

export interface ComputeResponse {
    result_str: string;
    result_latex?: string;
    meta?: Record<string, any>;
}

export interface BatchRequest {
    items: ComputeRequest[];
}

interface WorkerMessage {
    type: 'READY' | 'RESULT' | 'ERROR';
    id?: string;
    result?: any;
    error?: string;
}

class PyCalclyService {
    private worker: Worker | null = null;
    private readyPromise: Promise<void>;
    private pendingRequests: Map<string, { resolve: Function, reject: Function }> = new Map();

    constructor() {
        this.readyPromise = this.initWorker();
    }

    private initWorker(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof Worker === 'undefined') {
                reject(new Error("Web Workers not supported"));
                return;
            }

            // Vite worker import
            this.worker = new Worker(new URL('../workers/pyodideWorker.ts', import.meta.url), {
                type: 'module'
            });

            this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
                const { type, id, result, error } = event.data;

                if (type === 'READY') {
                    console.log('PyCalcly Engine Ready');
                    resolve();
                } else if (type === 'RESULT' && id) {
                    const req = this.pendingRequests.get(id);
                    if (req) {
                        req.resolve(result);
                        this.pendingRequests.delete(id);
                    }
                } else if (type === 'ERROR') {
                    if (id) {
                        const req = this.pendingRequests.get(id);
                        if (req) {
                            req.reject(new Error(error));
                            this.pendingRequests.delete(id);
                        }
                    } else {
                        console.error('PyCalcly Worker Error:', error);
                        // If init fails
                        if (!id) reject(new Error(error));
                    }
                }
            };

            // Send initialization signal with python source code
            this.worker.postMessage({
                type: 'INIT',
                payload: { pythonSource: engineSource }
            });
        });
    }

    public async waitForReady() {
        return this.readyPromise;
    }

    public async compute(req: ComputeRequest): Promise<ComputeResponse> {
        await this.readyPromise;
        const id = uuidv4();
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker?.postMessage({
                type: 'COMPUTE',
                id,
                payload: req
            });
        });
    }

    public async batch(req: BatchRequest): Promise<any[]> {
        await this.readyPromise;
        const id = uuidv4();
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker?.postMessage({
                type: 'BATCH',
                id,
                payload: req
            });
        });
    }
}

export const pyCalclyService = new PyCalclyService();
