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
  const envKey = (typeof window !== 'undefined' && window.env && window.env.API_KEY) 
              ? window.env.API_KEY 
              : process.env.API_KEY;

  if (!envKey) {
    console.warn("API_KEY not found in environment. Falling back to DEMO_API_KEY. Functionality may be limited.");
    return DEMO_API_KEY;
  }
  return envKey.trim();
};

// Define the schema definition string for the prompt since we can't pass the object to config when using tools
const schemaDefinition = `
{
  "type": "OBJECT",
  "properties": {
    "interpretation": { "type": "STRING", "description": "Concise restatement of query" },
    "result": {
      "type": "ARRAY",
      "description": "The answer broken down into parts to separate text from math. Use 'latex' for math equations, 'markdown' for text and currency.",
      "items": {
        "type": "OBJECT",
        "properties": {
          "type": { "type": "STRING", "enum": ["markdown", "latex"] },
          "content": { "type": "STRING", "description": "The content string. For markdown, do NOT use $ delimiters." }
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
          "content": { "type": "STRING" },
          "type": { "type": "STRING", "enum": ["text", "list", "code"] }
        }
      }
    },
    "chart": {
      "type": "OBJECT",
      "properties": {
        "type": { "type": "STRING", "enum": ["line", "bar", "area", "scatter"] },
        "title": { "type": "STRING" },
        "xLabel": { "type": "STRING" },
        "yLabel": { "type": "STRING" },
        "seriesKeys": { "type": "ARRAY", "items": { "type": "STRING" } },
        "data": { 
           "type": "ARRAY", 
           "items": { "type": "OBJECT", "description": "Data points with 'x' and series keys" } 
        }
      }
    },
    "suggestions": {
      "type": "ARRAY",
      "items": { "type": "STRING" },
      "description": "3-5 short, contextual follow-up actions or questions for the user (e.g., 'Show step-by-step', 'Plot graph', 'Convert to units')"
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
    const keyIndex = text.indexOf(`"${requiredKey}"`);
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
  const systemInstruction = `
    You are OmniSolver, an advanced computational intelligence engine similar to Wolfram Alpha.
    Your goal is to provide precise, structured, and factual answers.
    
    CRITICAL RULES:
    1.  **Structure**: The 'result' field is an ARRAY of objects. 
        - Use type 'markdown' for text, bolding (**text**), and CURRENCY ($100). **Do NOT** put LaTeX delimiters ($) in 'markdown' parts.
        - Use type 'latex' ONLY for mathematical expressions (integrals, fractions, greek letters). **Do NOT** include currency in 'latex' parts.
        - Example: [{type: 'markdown', content: 'The price is '}, {type: 'markdown', content: '$500'}, {type: 'markdown', content: '.'}]
    2.  **Brevity**: 'sections' should only be used for necessary details (steps, code, lists). Keep section content focused.
    3.  **Interpretation**: Briefly clarify how you interpreted the query.
    4.  **Visualization**: If the query involves math functions, statistical comparisons, or trends, YOU MUST generate a 'chart' object.
    5.  **Accuracy**: Use the googleSearch tool if the query requires up-to-date information.
    6.  **Format**: Return ONLY valid raw JSON matching the schema below.
    7.  **Math**: In 'latex' parts or 'sections', use LaTeX formatting. Wrap block math in double dollar signs ($$...$$) inside string fields in sections.
    8.  **JSON & Escaping**: All backslashes in LaTeX must be double-escaped (e.g., "\\\\approx").
    9.  **Multimodal**: Analyze images and audio if provided.
    10. **Suggestions**: Generate 3-5 "smart actions".
    
    SCHEMA:
    ${schemaDefinition}
  `;

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

    // Chart data normalization
    if (parsed.chart && parsed.chart.data) {
        parsed.chart.data = parsed.chart.data.map(d => {
            const clean: any = { x: d.x };
            if (typeof d['value1'] === 'number') clean[parsed.chart!.seriesKeys[0] || 'value'] = d['value1'];
            if (typeof d['value2'] === 'number') clean[parsed.chart!.seriesKeys[1] || 'value2'] = d['value2'];
            if (typeof d['value3'] === 'number') clean[parsed.chart!.seriesKeys[2] || 'value3'] = d['value3'];
            parsed.chart!.seriesKeys.forEach(key => {
               if (d[key] !== undefined) clean[key] = d[key];
            });
            return clean;
        });
    }

    // Safety Defaults
    if (!parsed.result) parsed.result = [];
    if (typeof parsed.result === 'string') {
        // Legacy/Error recovery: if model returned string despite prompt
        parsed.result = [{ type: 'markdown', content: parsed.result }];
    }
    if (!parsed.interpretation) parsed.interpretation = "";
    if (!parsed.sections) parsed.sections = [];

    return parsed;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
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

    RULES:
    1. **expression**: Must be a string. If the input is a matrix like [[1,2],[3,4]], return it as the string "[[1,2],[3,4]]". Do not return a JSON array.
    2. **operation**: 
       - "determinant" for "det", "determinant".
       - "invert" for "inverse", "invert".
       - "solve" for equation solving (e.g. x^2 + 2x = 0).
    3. **variable**: Infer from context (e.g., "integrate x^2" -> "x"). Default to "x" if ambiguous.
    4. **start/end**: Use for definite integrals, sums, or limits.
    
    EXAMPLES:
    - "Integrate x^2 from 0 to 5" -> {"operation": "integrate", "expression": "x^2", "variable": "x", "start": "0", "end": "5"}
    - "Determinant of [[1,2],[3,4]]" -> {"operation": "determinant", "expression": "[[1,2],[3,4]]"}
    - "Solve x^2 - 4 = 0" -> {"operation": "solve", "expression": "x^2 - 4 = 0", "variable": "x"}
  `;

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
         // Fallback if model fails to extract expression
         parsed.expression = query;
    }

    return parsed as MathCommand;
  } catch (e) {
    return { operation: 'evaluate', expression: query, preferredEngine: 'nerdamer' };
  }
};
