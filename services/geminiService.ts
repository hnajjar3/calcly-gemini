import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SolverResponse, ModelMode } from "../types";

export interface MathCommand {
  operation: string;
  expression: string;
  variable?: string;
  start?: string;
  end?: string;
  preferredEngine?: 'nerdamer' | 'algebrite' | 'gemini';
}

// Helper: Extract JSON from potentially messy model output
const extractJSON = (raw: string): string => {
  let text = raw.trim();
  // Try to find a JSON block
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) return jsonBlockMatch[1];
  
  // Fallback: Find first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  return text; 
};

// Centralized Error Handler
const handleGeminiError = (error: any): never => {
  console.error("Gemini API Error details:", error);
  let msg = error.message || error.toString();
  
  const lowerMsg = msg.toLowerCase();
  if (lowerMsg.includes('429') || lowerMsg.includes('quota')) throw new Error("⚠️ API Quota Exceeded.");
  if (lowerMsg.includes('api_key') || lowerMsg.includes('403')) throw new Error("⚠️ Invalid API Key.");
  if (lowerMsg.includes('503') || lowerMsg.includes('overloaded')) throw new Error("⚠️ AI Service Overloaded.");
  if (lowerMsg.includes('timed out')) throw new Error("⚠️ Request Timed Out.");

  throw new Error(msg || "An unexpected error occurred.");
};

const solverResponseSchema = {
  type: Type.OBJECT,
  properties: {
    interpretation: { type: Type.STRING, description: "Concise restatement of query" },
    result: {
      type: Type.ARRAY,
      description: "The answer broken down into parts. You can mix text and math.",
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          content: { type: Type.STRING }
        },
        required: ["type", "content"]
      }
    },
    confidenceScore: { type: Type.NUMBER },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          type: { type: Type.STRING },
          content: { type: Type.STRING },
          tableData: {
            type: Type.OBJECT,
            properties: {
              headers: { type: Type.ARRAY, items: { type: Type.STRING } },
              rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } }
            }
          }
        }
      }
    },
    chart: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING },
        title: { type: Type.STRING },
        labels: { type: Type.ARRAY, items: { type: Type.STRING } },
        datasets: { 
           type: Type.ARRAY, 
           items: { 
             type: Type.OBJECT, 
             properties: {
               label: { type: Type.STRING },
               data: { type: Type.ARRAY, items: { type: Type.NUMBER } }
             },
             required: ["label", "data"]
           } 
        }
      },
      required: ["type", "datasets"]
    },
    suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ["interpretation", "result", "sections"]
};

const attemptGenerate = async (modelMode: ModelMode, parts: any[]): Promise<SolverResponse> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const modelName = modelMode === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const thinkingBudget = modelMode === 'pro' ? 32768 : 24576; 

    const systemInstruction = `You are OmniSolver, an advanced computational intelligence engine. Always reason step-by-step before producing the final JSON response.`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget },
        responseMimeType: "application/json",
        responseSchema: solverResponseSchema,
      },
    });

    let parsed: SolverResponse;
    try {
      parsed = JSON.parse(response.text || "{}") as SolverResponse;
    } catch (e) {
      parsed = { interpretation: "Raw Response", result: [{ type: 'markdown', content: response.text || "" }], confidenceScore: 0.5, sections: [] };
    }
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      parsed.sources = groundingChunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({ title: chunk.web.title, uri: chunk.web.uri }));
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

export const parseMathCommand = async (query: string): Promise<MathCommand> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate the following query into a standardized math command JSON: "${query}"`,
    config: {
      systemInstruction: `You are a strict mathematical translation layer for symbolic engines.
      Output ONLY the final JSON object. 
      
      CRITICAL RULES:
      - "variable" MUST be ONLY the single letter variable name (e.g. "x", "n"). 
      - "start" and "end" MUST be strings representing the lower/upper bounds.
      - If the query is symbolic or has non-numeric limits (e.g. "to infinity", "to N"), set "preferredEngine" to "gemini".
      - Otherwise, prefer "nerdamer".
      
      Operations: integrate, diff, solve, simplify, factor, limit, sum, determinant, invert.`,
      thinkingConfig: { thinkingBudget: 4096 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          operation: { type: Type.STRING },
          expression: { type: Type.STRING },
          variable: { type: Type.STRING },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
          preferredEngine: { type: Type.STRING }
        },
        required: ["operation", "expression"]
      }
    },
  });

  const raw = response.text || "{}";
  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned) as MathCommand;
};

export const validateMathResult = async (query: string, result: string): Promise<{ isValid: boolean; reason?: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Query: "${query}"\nComputed Result: "${result}"`,
    config: {
      systemInstruction: "Check if the computed math result is logically and numerically correct for the given query. Output JSON ONLY.",
      thinkingConfig: { thinkingBudget: 2048 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isValid: { type: Type.BOOLEAN },
          reason: { type: Type.STRING }
        },
        required: ["isValid"]
      }
    },
  });
  return JSON.parse(extractJSON(response.text || "{}"));
};

export const solveMathWithAI = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: query,
    config: {
      systemInstruction: "Solve the math problem symbolically. Return only valid LaTeX for the result.",
      thinkingConfig: { thinkingBudget: 32768 }
    },
  });
  return response.text || "";
};

export const parseNumericalExpression = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Convert to Math.js syntax: "${query}"`,
    config: {
      systemInstruction: `Convert the query into a single Math.js compatible numerical expression. 
      Output ONLY a JSON object with the "expression" field. 
      
      CRITICAL MATH.JS SYNTAX RULES:
      1. UNIT MAPPING:
         - NEVER use 'mph' or 'kph' as these are not standard Math.js units.
         - 'mph' -> 'mi/h'
         - 'kph' -> 'km/h'
         - 'miles' -> 'mi'
         - 'feet' -> 'ft'
      2. CONVERSIONS: Use the 'to' keyword (e.g., '50 mi/h to km/h').
      3. CUSTOM FUNCTIONS (integral, integrate, deriv, derivative, diff):
         - The FIRST argument (expression) MUST be a DOUBLE-QUOTED STRING.
         - The SECOND argument (variable) MUST be a DOUBLE-QUOTED STRING.
         - CORRECT: integral("x^2", "x", 0, 1)
         - WRONG: integral(x^2, x, 0, 1)
      4. If unsupported, return 'UNSUPPORTED_OPERATION'.`,
      thinkingConfig: { thinkingBudget: 4096 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          expression: { type: Type.STRING }
        },
        required: ["expression"]
      }
    },
  });
  const raw = response.text || "{}";
  const cleaned = extractJSON(raw);
  const parsed = JSON.parse(cleaned);
  return parsed.expression || "UNSUPPORTED_OPERATION";
};

export const solveNumericalWithAI = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: query,
    config: {
      systemInstruction: "Compute the numerical result for the query. Return only the final number or value.",
      thinkingConfig: { thinkingBudget: 2048 }
    },
  });
  return response.text || "Error";
};
