
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { SolverResponse, ModelMode } from "../types";

declare global {
  interface Window {
    env?: {
      API_KEY?: string;
    };
  }
}

// DEMO KEY for Open Source usage (Fallback)
const DEMO_API_KEY = "AIzaSy_DEMO_KEY_PLACEHOLDER_CHANGE_ME"; 

// Helper to ensure API key presence
const getApiKey = (): string => {
  if (typeof window !== 'undefined' && window.env && window.env.API_KEY) {
      return window.env.API_KEY;
  }
  
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
    }
  } catch(e) {}

  return DEMO_API_KEY;
};

// Helper: Promise Timeout Wrapper
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("Request Timed Out"));
        }, ms);

        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            }
        );
    });
};

// Centralized Error Handler
const handleGeminiError = (error: any): never => {
  console.error("Gemini API Error details:", error);
  let msg = error.message || error.toString();
  
  if (error.error) {
      if (error.error.message) msg = error.error.message;
      if (error.error.code === 429 || error.error.status === 'RESOURCE_EXHAUSTED') msg = "Quota exceeded"; 
  }

  const lowerMsg = msg.toLowerCase();
  if (lowerMsg.includes('429') || lowerMsg.includes('quota')) throw new Error("⚠️ API Quota Exceeded.");
  if (lowerMsg.includes('api_key') || lowerMsg.includes('403')) throw new Error("⚠️ Invalid API Key.");
  if (lowerMsg.includes('503') || lowerMsg.includes('overloaded')) throw new Error("⚠️ AI Service Overloaded.");
  if (lowerMsg.includes('timed out')) throw new Error("⚠️ Request Timed Out.");

  throw new Error(msg || "An unexpected error occurred.");
};

const schemaDefinition = `
{
  "type": "OBJECT",
  "properties": {
    "interpretation": { "type": "STRING", "description": "Concise restatement of query" },
    "result": {
      "type": "ARRAY",
      "description": "The answer broken down into parts. You can mix text and math.",
      "items": {
        "type": "OBJECT",
        "properties": {
          "type": { "type": "STRING", "enum": ["markdown", "latex"] },
          "content": { "type": "STRING" }
        },
        "required": ["type", "content"]
      }
    },
    "confidenceScore": { "type": "NUMBER" },
    "sections": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "title": { "type": "STRING" },
          "type": { "type": "STRING", "enum": ["text", "list", "code", "table"] },
          "content": { "type": "STRING" },
          "tableData": {
            "type": "OBJECT",
            "properties": {
              "headers": { "type": "ARRAY", "items": { "type": "STRING" } },
              "rows": { "type": "ARRAY", "items": { "type": "ARRAY", "items": { "type": "STRING" } } }
            }
          }
        }
      }
    },
    "chart": {
      "type": "OBJECT",
      "properties": {
        "type": { "type": "STRING", "enum": ["line", "bar", "area", "pie", "doughnut", "radar", "scatter"] },
        "title": { "type": "STRING" },
        "labels": { "type": "ARRAY", "items": { "type": "STRING" } },
        "datasets": { 
           "type": "ARRAY", 
           "items": { 
             "type": "OBJECT", 
             "properties": {
               "label": { "type": "STRING" },
               "data": { "type": "ARRAY", "items": { "type": "NUMBER" } }
             },
             "required": ["label", "data"]
           } 
        }
      },
      "required": ["type", "datasets"]
    },
    "suggestions": { "type": "ARRAY", "items": { "type": "STRING" } }
  },
  "required": ["interpretation", "result", "sections"]
}
`;

const extractJSON = (raw: string): string => {
  let text = raw.trim();
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) return jsonBlockMatch[1];
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) return text.substring(firstBrace, lastBrace + 1);
  return text; 
};

const attemptGenerate = async (modelMode: ModelMode, parts: any[]): Promise<SolverResponse> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelName = modelMode === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const thinkingBudget = modelMode === 'pro' ? 32768 : 24576; 

    console.log(`[GeminiService] Initializing ${modelName} with thinking budget: ${thinkingBudget}`);

    let systemInstruction = `You are OmniSolver, an advanced computational intelligence engine. JSON output required. Always reason step-by-step before producing the final JSON.`;
    systemInstruction += modelMode === 'flash' ? `\n[MODE: FLASH - SPEED]` : `\n[MODE: PRO INTELLIGENCE]`;
    systemInstruction += `\n\nJSON SCHEMA:\n${schemaDefinition}`;

    const timeoutMs = modelMode === 'pro' ? 45000 : 25000;
    const response = await withTimeout<GenerateContentResponse>(
      ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingBudget },
        },
      }),
      timeoutMs
    );

    const text = response.text || "";
    const jsonText = extractJSON(text);
    let parsed: SolverResponse;
    try {
      parsed = JSON.parse(jsonText) as SolverResponse;
    } catch (e) {
      parsed = { interpretation: "Raw Response", result: [{ type: 'markdown', content: text }], confidenceScore: 0.5, sections: [] };
    }
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      parsed.sources = groundingChunks.map((chunk: any) => chunk.web).filter((web: any) => web && web.uri).map((web: any) => ({ title: web.title, uri: web.uri }));
    }

    return parsed;
};

export const solveQuery = async (query: string, mode: ModelMode = 'pro', imageBase64?: string, audioBase64?: string, context?: { previousQuery: string; previousResult: string }): Promise<SolverResponse> => {
  const parts: any[] = [];
  if (context) parts.push({ text: `[CONTEXT] Previous Query: "${context.previousQuery}"\nPrevious Result: "${context.previousResult}"` });
  if (query) parts.push({ text: query });
  if (imageBase64) parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64.split(',')[1] || imageBase64 } });
  if (audioBase64) parts.push({ inlineData: { mimeType: "audio/webm", data: audioBase64.split(',')[1] || audioBase64 } });

  try {
    return await attemptGenerate(mode, parts);
  } catch (error: any) {
    if (mode === 'pro') {
        console.warn(`[GeminiService] Pro failed, falling back to Flash...`);
        return await attemptGenerate('flash', parts);
    }
    handleGeminiError(error);
  }
};

export interface MathCommand {
  operation: string; expression: string; variable?: string; start?: string; end?: string; preferredEngine?: 'nerdamer' | 'algebrite';
}

export const parseMathCommand = async (query: string): Promise<MathCommand> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = 'gemini-3-flash-preview';
  const thinkingBudget = 8192; 
  console.log(`[GeminiService] Parsing Math with ${modelName} (Thinking Enabled)`);

  const systemInstruction = `You are a mathematical translation layer for Nerdamer and Algebrite.
  Convert queries into the following strict JSON schema.
  
  ALLOWED OPERATION TOKENS (Use these exactly):
  - "integrate" (for integral, integration, area under curve)
  - "diff" (for derivative, differentiate, differentiation, slope)
  - "solve" (for find roots, solve for x, equations)
  - "simplify" (for expand, reduce, simple form)
  - "factor" (for factorization)
  - "limit" (for limits)
  - "sum" (for series summation)
  - "determinant" (for matrix determinant)
  - "invert" (for matrix inverse)
  
  SYNTAX RULES:
  - Use "^" for powers.
  - Use "exp(x)" for natural exponent.
  - For indefinite integrals, set "start" and "end" to null.
  - If no variable is specified, assume "x".
  
  Format: { "operation": "string", "expression": "string", "variable": "string", "start": "string|null", "end": "string|null" }`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: query }] },
      config: { 
        systemInstruction, 
        thinkingConfig: { thinkingBudget }, 
        responseMimeType: 'application/json' 
      }
    });
    return JSON.parse(extractJSON(response.text || '')) as MathCommand;
  } catch (error) {
    return { operation: 'evaluate', expression: query };
  }
};

export const parseNumericalExpression = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelName = 'gemini-3-flash-preview';
  const thinkingBudget = 8192;
  console.log(`[GeminiService] Parsing Numerical with ${modelName} (Thinking Enabled)`);
  const systemInstruction = `Convert natural language to Math.js syntax. Output JSON: { "expression": "string" }.`;
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: query }] },
      config: { 
        systemInstruction, 
        thinkingConfig: { thinkingBudget }, 
        responseMimeType: 'application/json' 
      }
    });
    return JSON.parse(extractJSON(response.text || '')).expression || query;
  } catch (error) {
    return query;
  }
};

export const solveNumericalWithAI = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: query }] },
      config: { 
        systemInstruction: "Output ONLY the final numerical result as a single value.", 
        thinkingConfig: { thinkingBudget: 4096 } 
      }
    });
    return response.text?.trim() || "Error";
  } catch (error) {
    return "Error";
  }
};

export const validateMathResult = async (query: string, result: string): Promise<{ isValid: boolean; reason?: string }> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const timeoutMs = 8000;

  try {
    const response = await withTimeout<GenerateContentResponse>(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: `Query: "${query}"\nResult: "${result}"` }] },
        config: { 
          systemInstruction: "Verify if the provided result is mathematically correct for the query. Output JSON: {isValid: boolean, reason?: string}.", 
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 4096 }
        }
      }),
      timeoutMs
    );
    return JSON.parse(extractJSON(response.text || ''));
  } catch (error) {
    console.warn("[GeminiService] Validation failed or timed out. Defaulting to valid.", error);
    return { isValid: true };
  }
};

export const explainMathResult = async (query: string, result: string, engine: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: "Explain." }] },
      config: { 
        systemInstruction: `Provide a clear step-by-step explanation of how to arrive at "${result}" from "${query}".`, 
        thinkingConfig: { thinkingBudget: 4096 } 
      }
    });
    return response.text || "No explanation.";
  } catch (error) {
    return "Explanation error.";
  }
};

export const solveMathWithAI = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: query }] },
      config: { 
        systemInstruction: "Solve and output ONLY the final LaTeX result in $$...$$.", 
        thinkingConfig: { thinkingBudget: 8192 } 
      }
    });
    return response.text?.trim() || "";
  } catch (error) {
    return "";
  }
};
