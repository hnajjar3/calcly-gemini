
import { GoogleGenAI, Type } from "@google/genai";
import { SolverResponse, ModelMode } from "../types";

declare global {
  interface Window {
    env?: {
      API_KEY?: string;
    };
  }
}

// DEMO KEY for Open Source usage (Fallback)
// NOTE: This is a placeholder. For the app to function correctly, 
// you must provide a valid API key in your .env file or build environment.
const DEMO_API_KEY = "AIzaSy_DEMO_KEY_PLACEHOLDER_CHANGE_ME"; 

// Helper to ensure API key presence
const getApiKey = (): string => {
  // Check runtime injected env (cloud run / docker)
  if (typeof window !== 'undefined' && window.env && window.env.API_KEY) {
      return window.env.API_KEY;
  }
  
  // Check build-time injected env (vite) - safe access to process
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
    }
  } catch(e) {
    // process not defined
  }

  console.warn("API_KEY not found in environment. Falling back to DEMO_API_KEY. Functionality may be limited.");
  return DEMO_API_KEY;
};

// Centralized Error Handler
const handleGeminiError = (error: any): never => {
  console.error("Gemini API Error details:", error);
  
  let msg = error.message || error.toString();
  
  // Handle structured error objects coming directly from the API response (Raw JSON)
  // Example: {"error":{"code":429,"message":"...","status":"RESOURCE_EXHAUSTED"}}
  if (error.error) {
      if (error.error.message) {
          msg = error.error.message;
      }
      // Explicitly check for Quota codes in the raw error object
      if (error.error.code === 429 || error.error.status === 'RESOURCE_EXHAUSTED') {
          msg = "Quota exceeded"; 
      }
  }

  const lowerMsg = msg.toLowerCase();

  // Handle Quota/Rate Limits (429)
  if (lowerMsg.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('resource_exhausted')) {
    throw new Error("⚠️ API Quota Exceeded. You have reached the usage limit for your API key. Please try again later or check your billing details.");
  }
  
  // Handle Auth Errors (400/403)
  if (lowerMsg.includes('api_key') || lowerMsg.includes('403') || lowerMsg.includes('key not valid')) {
    throw new Error("⚠️ Invalid API Key. Please check your .env configuration.");
  }

  // Handle Server Errors (500/503)
  if (lowerMsg.includes('503') || lowerMsg.includes('overloaded') || lowerMsg.includes('internal')) {
    throw new Error("⚠️ AI Service Overloaded. Please try again in a few seconds.");
  }
  
  // Filter out raw JSON if possible to make it readable
  if (msg.includes('{')) {
      try {
          // Attempt to extract message from JSON string if present
          const jsonMatch = msg.match(/\{.*\}/);
          if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.error && parsed.error.message) {
                  msg = parsed.error.message;
              }
          }
      } catch (e) {
          // ignore parse error
      }
  }

  throw new Error(msg || "An unexpected error occurred connecting to AI.");
};

// Define the schema definition string for the prompt since we can't pass the object to config when using tools
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
          "content": { "type": "STRING", "description": "Content string." }
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
          "content": { "type": "STRING", "description": "For text/list/code. Markdown allowed." },
          "tableData": {
            "type": "OBJECT",
            "description": "Required for type 'table'.",
            "properties": {
              "headers": { "type": "ARRAY", "items": { "type": "STRING" } },
              "rows": { 
                "type": "ARRAY", 
                "items": { 
                  "type": "ARRAY", 
                  "items": { "type": "STRING", "description": "Cell content. Can include LaTeX wrapped in $...$." } 
                } 
              }
            }
          }
        }
      }
    },
    "chart": {
      "type": "OBJECT",
      "description": "Structured data for Chart.js",
      "properties": {
        "type": { "type": "STRING", "enum": ["line", "bar", "pie", "doughnut", "radar", "scatter"] },
        "title": { "type": "STRING" },
        "labels": { 
          "type": "ARRAY", 
          "items": { "type": "STRING" }, 
          "description": "Labels for the X-axis (bar/line) or segments (pie/doughnut)" 
        },
        "datasets": { 
           "type": "ARRAY", 
           "items": { 
             "type": "OBJECT", 
             "properties": {
               "label": { "type": "STRING", "description": "Name of this dataset (e.g., 'Hummus')" },
               "data": { "type": "ARRAY", "items": { "type": "NUMBER" }, "description": "Data points corresponding to labels" }
             },
             "required": ["label", "data"]
           } 
        }
      },
      "required": ["type", "datasets"]
    },
    "suggestions": {
      "type": "ARRAY",
      "items": { "type": "STRING" },
      "description": "3-5 short, contextual follow-up actions or questions for the user"
    }
  },
  "required": ["interpretation", "result", "sections"]
}
`;

// Robust JSON Extractor
const extractJSON = (raw: string, requiredKey?: string): string => {
  let text = raw.trim();

  // 1. Try markdown code block extraction
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) return jsonBlockMatch[1];
  
  const genericBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (genericBlockMatch) return genericBlockMatch[1];

  // 2. Heuristic: Look for specific schema keys to find the real start if provided
  if (requiredKey) {
    const keyIndex = text.lastIndexOf(`"${requiredKey}"`);
    if (keyIndex !== -1) {
        // Find the opening brace belonging to this key. 
        // It should be the closest '{' before this key.
        const sub = text.substring(0, keyIndex);
        const realStart = sub.lastIndexOf('{');
        if (realStart !== -1) {
            // Find the last '}'
            const realEnd = text.lastIndexOf('}');
            if (realEnd > realStart) {
                return text.substring(realStart, realEnd + 1);
            }
        }
    }
  }

  // 3. Fallback: Naive brace extraction (first { to last })
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
       return text.substring(firstBrace, lastBrace + 1);
  }

  return text; 
};

export const solveQuery = async (
  query: string, 
  mode: ModelMode = 'pro',
  imageBase64?: string,
  audioBase64?: string,
  context?: { previousQuery: string; previousResult: string }
): Promise<SolverResponse> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // Prompt engineering to guide the model towards Wolfram-like behavior
  let systemInstruction = `
    You are OmniSolver, an advanced computational intelligence engine similar to Wolfram Alpha.
    Your goal is to provide precise, structured, and factual answers.
    
    CRITICAL RULES:
    1.  **Structure**: The 'result' field is an ARRAY of objects. 
        - You can mix Markdown text and LaTeX math in 'markdown' parts.
        - **IMPORTANT**: If you use LaTeX math, YOU MUST wrap it in single \`$\` (inline) or double \`$$\` (block).
    2.  **Tables**: For data comparisons, nutritional info, or specs, USE type 'table' in 'sections' and populate 'tableData'.
    3.  **Visualization (Charts)**:
        - If the query implies comparison, statistics, trends, or distribution, YOU MUST generate a 'chart' object.
        - **Format**: Return a JSON structure compatible with Chart.js:
          - 'labels': An array of strings for the X-axis (e.g. ["Protein", "Fat", "Carbs"]).
          - 'datasets': An array of objects, each with a 'label' (series name) and 'data' (array of numbers).
        - **Comparisons**: For "Hummus vs Guacamole", provide ONE chart with 'labels' as the nutrients and TWO 'datasets' (one for Hummus, one for Guacamole).
        - **Composition**: Use type 'pie' or 'doughnut' for breakdowns.
        - **Profiles**: Use type 'radar' for comparing multi-attribute profiles (e.g. nutrition, stats).
        - **Trends**: Use type 'line' for time series.
        - **Magnitudes**: Use type 'bar' for comparing amounts.
    4.  **Accuracy**: Use the googleSearch tool if the query requires up-to-date information.
    5.  **Format**: Return ONLY valid raw JSON matching the schema below.
    
    SCHEMA:
    ${schemaDefinition}
  `;

  // Inject specific instructions for Flash vs Pro to optimize output tokens and quality
  if (mode === 'flash') {
    systemInstruction += `
    
    [STRICT MODE: FLASH]
    1. **EXTREME CONCISENESS**: Output ONLY the final answer. No filler words. Max 1-2 sentences.
    2. **SIMPLICITY**: Do not use complex Markdown or nested structures. Use plain text where possible.
    3. **STRUCTURE**: 
       - 'result': The short text answer (max 40 words).
       - 'sections': KEEP EMPTY [] unless a code block is strictly required.
       - 'chart': DO NOT GENERATE charts.
       - 'suggestions': Max 2 items.
    4. **INTERPRETATION**: Max 3-5 words.
    5. **NO CONVERSATION**: Do not say "Here is the answer". Just give the answer.
    `;
  } else {
     systemInstruction += `
     
     [MODE: PRO INTELLIGENCE]
     - Provide comprehensive, deep, and detailed explanations.
     - Use multiple sections to cover different aspects of the query.
     - Show your reasoning where applicable.
     - Use charts and visualizations where helpful.
     `;
  }

  // Select model based on mode
  const modelName = mode === 'pro' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
  const thinkingBudget = mode === 'pro' ? 4096 : 0;

  try {
    const parts: any[] = [];
    
    // Inject Context if available
    if (context) {
        parts.push({ 
            text: `[CONTEXT FROM PREVIOUS TURN]\nUser Question: "${context.previousQuery}"\nAI Answer: "${context.previousResult}"\n\n[CURRENT QUESTION]\n` 
        });
    }
    
    if (query) {
      parts.push({ text: query });
    } else if (audioBase64) {
      parts.push({ text: "Please listen to the attached audio and solve the problem described." });
    }

    if (imageBase64) {
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      parts.push({
        inlineData: {
          mimeType: "image/jpeg", 
          data: base64Data
        }
      });
    }

    if (audioBase64) {
       const base64Data = audioBase64.split(',')[1] || audioBase64;
       parts.push({
         inlineData: {
           mimeType: "audio/webm",
           data: base64Data
         }
       });
    }

    if (parts.length === 0) {
        throw new Error("No input provided (text, image, or audio).");
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget },
      },
    });

    let text = response.text;
    if (!text) throw new Error("No response received from Gemini.");

    const jsonText = extractJSON(text, 'interpretation');

    let parsed: SolverResponse;
    try {
      parsed = JSON.parse(jsonText) as SolverResponse;
    } catch (e) {
      try {
        const repaired = jsonText.replace(/\\(?!(["\\/bfnrt]|u[0-9a-fA-F]{4}))/g, "\\\\");
        parsed = JSON.parse(repaired) as SolverResponse;
        console.warn("Original JSON parse failed, but repair was successful.");
      } catch (repairError) {
        console.warn("JSON Parse Failed. Fallback to raw text.");
        const raw = text.trim();
        parsed = {
            interpretation: "System Message",
            result: [{ type: 'markdown', content: raw }],
            confidenceScore: 1.0,
            sections: [],
            suggestions: ["Refine Query", "Provide Details"]
        };
      }
    }
    
    // Extract grounding metadata
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      const sources = groundingChunks
        .map((chunk: any) => chunk.web)
        .filter((web: any) => web && web.uri && web.title)
        .map((web: any) => ({ title: web.title, uri: web.uri }));
        
      if (sources.length > 0) {
        parsed.sources = sources;
      }
    }

    // Safety Defaults
    if (!parsed.result) parsed.result = [];
    if (typeof parsed.result === 'string') {
        parsed.result = [{ type: 'markdown', content: parsed.result }];
    }
    if (!parsed.interpretation) parsed.interpretation = "";
    if (!parsed.sections) parsed.sections = [];

    return parsed;
  } catch (error) {
    handleGeminiError(error);
  }
};

export interface MathCommand {
  operation: 'integrate' | 'differentiate' | 'solve' | 'simplify' | 'factor' | 'limit' | 'sum' | 'evaluate' | 'determinant' | 'invert' | 'taylor';
  expression: string;
  variable?: string;
  start?: string;
  end?: string;
  preferredEngine?: 'nerdamer' | 'algebrite';
}

export const parseMathCommand = async (query: string): Promise<MathCommand> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const systemInstruction = `
    You are a math syntax parser. Your goal is to map natural language math queries into a strict JSON command structure for a symbolic engine.

    OUTPUT JSON SCHEMA:
    {
      "operation": "integrate" | "differentiate" | "solve" | "simplify" | "factor" | "limit" | "sum" | "evaluate" | "determinant" | "invert" | "taylor",
      "expression": "string",
      "variable": "string (optional, default 'x')",
      "start": "string (optional)",
      "end": "string (optional)",
      "preferredEngine": "nerdamer" | "algebrite" (optional)
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: query }] },
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json'
      }
    });

    const jsonText = extractJSON(response.text || '', 'operation');

    try {
      const parsed = JSON.parse(jsonText);
      
      // Normalization Layer: Ensure expression is a string
      if (parsed.matrix && !parsed.expression) {
          parsed.expression = typeof parsed.matrix === 'string' ? parsed.matrix : JSON.stringify(parsed.matrix);
      }
      
      if (parsed.expression && typeof parsed.expression !== 'string') {
          parsed.expression = JSON.stringify(parsed.expression);
      }
      
      if (!parsed.expression) {
           parsed.expression = query;
      }

      return parsed as MathCommand;
    } catch (e) {
      return { operation: 'evaluate', expression: query, preferredEngine: 'nerdamer' };
    }
  } catch (error) {
    // If parsing fails due to API error, fall back to simple evaluation
    console.warn("Parse API failed, falling back to local eval:", error);
    return { operation: 'evaluate', expression: query, preferredEngine: 'nerdamer' };
  }
};

export const parseNumericalExpression = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const systemInstruction = `
    You are a Math.js Translator. Your goal is to convert natural language queries into valid Math.js syntax.
    OUTPUT JSON SCHEMA: { "expression": "string" }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: query }] },
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json'
      }
    });

    const jsonText = extractJSON(response.text || '', 'expression');

    try {
      const parsed = JSON.parse(jsonText);
      return parsed.expression || query;
    } catch (e) {
      return query; 
    }
  } catch (error) {
    console.warn("Numerical parsing API failed, falling back to raw input:", error);
    return query;
  }
};
