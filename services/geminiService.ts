import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SolverResponse, ModelMode } from "../types";

export interface MathCommand {
  operation: string;
  expression: string;
  variable?: string;
  start?: string;
  end?: string;
  preferredEngine?: 'nerdamer' | 'algebrite' | 'gemini';
  complexityClass: 'standard' | 'abstract' | 'impossible_locally';
}

export interface NumericalCommand {
  expression: string;
  solvableLocally: boolean;
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

// ... (attemptGenerate and other helper functions remain the same if not used by generateCodeFromPrompt) ...

export const generateCodeFromPrompt = async (query: string, previousCode?: string, mathMode: 'numerical' | 'symbolic' | 'auto' = 'auto'): Promise<CodeGenerationResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  if (previousCode) {
    parts.push({ text: `Current Code:\n\`\`\`javascript\n${previousCode}\n\`\`\`` });
  }
  parts.push({ text: `User Request: "${query}"` });
  parts.push({ text: `Mode: ${mathMode.toUpperCase()}` });

  const systemInstruction = `You are an expert helper for a "Matlab-like" JavaScript environment.
            Your goal is to convert Natural Language requests into executable JavaScript code.
            
            Key Environment Details:
            - The code runs in a browser environment.
            - There is a persistent 'scope'.
            - Available globals: 
                - 'Math', 'Date', 'console'
                - 'plot(data, layout)' (Plotly.js)
                - 'math' (Math.js) - Use for Numerical Mode
                - 'nerdamer' (Nerdamer) - Use for Symbolic Algebra/Solving
                - 'Algebrite' (Algebrite) - Use for Symbolic Evaluation/CAS
            
            Instructions:
            1. Generate CLEAN, EXECUTABLE JavaScript.
            2. Define variables at the top level.
            3. Do NOT wrap code in markdown blocks in the JSON output, just plain string.
            
            MODE SPECIFIC INSTRUCTIONS:
            - IF MODE IS 'NUMERICAL':
                - Use 'math.evaluate()' / 'math.matrix()' for complex calculations.
            - IF MODE IS 'SYMBOLIC':
                - Use 'nerdamer' (preferred for solving equations).
                - Use 'Algebrite' (preferred for symbolic simplification or tensor math).
                  - Ex: \`const res = Algebrite.run('simplify(a+a)');\`
            - IF MODE IS 'AUTO' (Recommended):
                - INTELLIGENTLY MIX libraries.
                - **Solving/Calculus**: Use 'nerdamer' ('solve', 'integrate').
                - **Deep CAS/Simplification**: Use 'Algebrite'.
                - **Plotting/Matrices**: Use 'math.js'.
                - Example: "Simplify x+x and then plot it from 0 to 10"
                    \`
                    const simp = Algebrite.run('x+x'); // "2x"
                    // Parse "2x" or use a lambda
                    const f = (val) => 2 * val; 
                    // Plot loop...
                    \`
            
            Output JSON ONLY.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: {
      systemInstruction: systemInstruction,
      thinkingConfig: { thinkingBudget: 8192 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING, description: "The executable JavaScript code" },
          explanation: { type: Type.STRING, description: "Brief explanation of what the code does" }
        },
        required: ["code", "explanation"]
      }
    }
  });

  const raw = response.text || "{}";
  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned) as CodeGenerationResponse;
};

export const reviewCode = async (code: string, userMessage: string, mathMode: 'numerical' | 'symbolic' | 'auto'): Promise<{ message: string; fixedCode?: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [
    { text: `Current Code:\n\`\`\`javascript\n${code}\n\`\`\`` },
    { text: `User Message: "${userMessage}"` },
    { text: `Math Mode: ${mathMode.toUpperCase()}` }
  ];

  const systemInstruction = `You are a Code Reviewer/Assistant for the Calcly IDE.
            Analyze the user's request and the current code.
            
            Environment:
            - Browser JS with 'math' (Math.js), 'nerdamer' (Nerdamer), 'Algebrite' (Algebrite) available.
            - 'plot(data, layout)' is available.
            - Current Mode: ${mathMode}
            
            Tasks:
            1. Use 'Algebrite.run(encoded_string)' if user asks for CAS features better suited for Algebrite.
            2. Use 'nerdamer(...)' for standard solving.
            3. Fix errors if found.
            
            Output JSON: { "message": "Natural language response...", "fixedCode": "Optional string if code should be updated" }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: {
      systemInstruction: systemInstruction,
      thinkingConfig: { thinkingBudget: 4096 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          message: { type: Type.STRING },
          fixedCode: { type: Type.STRING, nullable: true }
        },
        required: ["message"]
      }
    }
  });

  const raw = response.text || "{}";
  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned);
};
