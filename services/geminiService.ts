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
// In our setup:
// 1. Local Dev: injected via vite transformIndexHtml into window.env
// 2. Production: injected via server.js replacement into window.env
// 3. Fallback: Uses DEMO_API_KEY if env var is missing
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
    "result": { "type": "STRING", "description": "Direct answer, max 2-3 sentences unless complex derivation needed" },
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
  // This is risky if LaTeX is present before the JSON, so we do it last
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
  // heavily emphasizing JSON output since we can't use responseMimeType: 'application/json' with tools
  const systemInstruction = `
    You are OmniSolver, an advanced computational intelligence engine similar to Wolfram Alpha.
    Your goal is to provide precise, structured, and factual answers.
    
    CRITICAL RULES:
    1.  **CONCISENESS**: Keep the 'result' field extremely tight and direct. Avoid conversational filler (e.g., "Here is the answer..."). Just state the fact or number.
    2.  **Brevity**: 'sections' should only be used for necessary details (steps, code, lists). Keep section content focused.
    3.  **Interpretation**: Briefly clarify how you interpreted the query. If the input is audio, transcribe the core intent.
    4.  **Visualization**: If the query involves math functions, statistical comparisons, or trends, YOU MUST generate a 'chart' object with at least 10-20 data points.
        - For math functions (e.g., sin(x)), generate points within a reasonable range.
        - For real-world data (e.g., GDP), use the 'googleSearch' tool to get accurate data points.
        - Map your data values to 'value1', 'value2', etc., and list the corresponding names in 'seriesKeys'.
    5.  **Accuracy**: Use the googleSearch tool if the query requires up-to-date information or specific facts.
    6.  **Format**: Return ONLY valid raw JSON matching the schema below. DO NOT wrap the JSON in markdown code blocks.
    7.  **Math**: Use LaTeX formatting for all mathematical expressions. Wrap inline math in single dollar signs ($...$) and block math in double dollar signs ($$...$$).
    8.  **JSON & Escaping**: You are outputting a JSON string. **ALL backslashes in LaTeX must be double-escaped**. 
        - Incorrect: "\\approx", "\\theta", "\\frac"
        - Correct: "\\\\approx", "\\\\theta", "\\\\frac"
    9.  **Code**: If code is requested or relevant, put it in a separate section with type "code". Do not mix code blocks inside "text" sections if possible.
    10. **Multimodal**: 
        - If an image is provided, analyze it thoroughly.
        - If AUDIO is provided, listen to the speech carefully, interpret the problem described, and solve it.
    11. **Suggestions**: Generate 3-5 "smart actions" or follow-up questions. 
        - If Math: "Solve for x", "Graph it", "Show derivative", "Step-by-step".
        - If Data: "Compare with [Related]", "Show history", "Visualize".
        - General: "Explain simply", "More details", "Translate to Spanish".
    12. **Symbolic Engine Selection**:
        - For standard algebra/calculus, "nerdamer" is preferred.
        - For SPECIALIZED functions: **Hilbert Matrix** ('hilbert'), **Legendre Polynomials** ('legendre'), **Bessel functions** ('bessel'), **Hermite polynomials** ('hermite'), **Chebyshev polynomials** ('chebyshev'), **Laguerre polynomials** ('laguerre'), and **Circular** matrices ('circlular'), YOU MUST PREFER 'algebrite'.
        - If you detect these functions, ensure you guide the symbolic solver preference accordingly if asked.
    13. **Clarifications & Errors**: 
        - If the query is unclear, ambiguous, or lacks details, you MUST still return a valid JSON object.
        - Put your request for clarification in the 'result' field.
        - Set 'interpretation' to "Clarification needed" or similar.
        - Do NOT return plain text.

    SCHEMA:
    ${schemaDefinition}
  `;

  // Select model based on mode
  const modelName = mode === 'pro' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
  
  // Configure thinking: High budget for Pro, disabled (0) for Flash for speed
  const thinkingBudget = mode === 'pro' ? 4096 : 0;

  try {
    // Construct contents (Text + Optional Image + Optional Audio)
    const parts: any[] = [];
    
    // Inject Context if available
    if (context) {
        parts.push({ 
            text: `[CONTEXT FROM PREVIOUS TURN]\nUser Question: "${context.previousQuery}"\nAI Answer: "${context.previousResult}"\n\n[CURRENT QUESTION]\n` 
        });
    }
    
    // Add text part if present, or if it's purely audio we can add a prompt instruction
    if (query) {
      parts.push({ text: query });
    } else if (audioBase64) {
      parts.push({ text: "Please listen to the attached audio and solve the problem described." });
    }

    if (imageBase64) {
      // Remove data URL prefix if present for clean base64
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
       // Assuming webm from MediaRecorder, Gemini handles generic containers well.
       // We'll specify a common MIME type or let the model infer.
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

    // Extract JSON using robust logic looking for "interpretation" key
    const jsonText = extractJSON(text, 'interpretation');

    let parsed: SolverResponse;
    try {
      parsed = JSON.parse(jsonText) as SolverResponse;
    } catch (e) {
      // JSON Parse Failed. This is common with LLMs generating LaTeX inside JSON strings 
      // where they use single backslashes (e.g. \approx) which are invalid JSON escape sequences.
      // We attempt to repair the string by escaping invalid backslashes.
      try {
        // Regex: Match a backslash that is NOT followed by a valid escape char (", \, /, b, f, n, r, t, or uXXXX)
        // We replace it with double backslash.
        const repaired = jsonText.replace(/\\(?!(["\\/bfnrt]|u[0-9a-fA-F]{4}))/g, "\\\\");
        parsed = JSON.parse(repaired) as SolverResponse;
        console.warn("Original JSON parse failed, but repair was successful.");
      } catch (repairError) {
        console.warn("JSON Parse Failed on extracted text. Attempting fallback on raw response.");
        // Fallback: If the model returned plain text (e.g. clarification request), 
        // wrap it manually into our schema.
        const raw = text.trim();
        if (raw && !raw.startsWith('{')) {
            parsed = {
                interpretation: "System Message",
                result: raw,
                confidenceScore: 1.0,
                sections: [],
                suggestions: ["Refine Query", "Provide Details"]
            };
        } else {
            console.error("JSON Parse Error", jsonText);
            throw new Error("Failed to parse AI response. The model did not return valid JSON.");
        }
      }
    }
    
    // Extract grounding metadata (Sources)
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

    // Data normalization for the chart if needed
    if (parsed.chart && parsed.chart.data) {
        // Ensure data points are clean (sometimes models output nulls for optional fields)
        parsed.chart.data = parsed.chart.data.map(d => {
            const clean: any = { x: d.x };
            if (typeof d['value1'] === 'number') clean[parsed.chart!.seriesKeys[0] || 'value'] = d['value1'];
            if (typeof d['value2'] === 'number') clean[parsed.chart!.seriesKeys[1] || 'value2'] = d['value2'];
            if (typeof d['value3'] === 'number') clean[parsed.chart!.seriesKeys[2] || 'value3'] = d['value3'];
            // Also copy over any keys that exactly match seriesKeys
            parsed.chart!.seriesKeys.forEach(key => {
               if (d[key] !== undefined) clean[key] = d[key];
            });
            return clean;
        });
    }

    // Safety Defaults to prevent UI crashes if model returns partial object
    if (!parsed.result) parsed.result = "";
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
  start?: string; // Used for bounds OR taylor series center point
  end?: string; // Used for bounds OR taylor series order
  preferredEngine?: 'nerdamer' | 'algebrite';
}

export const parseMathCommand = async (query: string): Promise<MathCommand> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const systemInstruction = `
    You are a math syntax parser. Your goal is to map natural language math queries into a specific structured JSON command object.
    
    Operations: 
    - "integrate" (definite and indefinite)
    - "differentiate"
    - "solve" (equations, roots, systems of equations)
    - "simplify"
    - "factor"
    - "limit"
    - "sum"
    - "evaluate"
    - "determinant" (matrix determinant)
    - "invert" (matrix inversion)
    - "taylor" (Taylor series expansion)

    Fields:
    - operation: The operation type.
    - expression: The mathematical expression.
      * CRITICAL: Do NOT include 'y=' or 'f(x)='. Just the right-hand side.
      * CRITICAL: Do NOT include 'dx' or 'dt' in integrals. Just the integrand.
      * MATRICES: Return matrices in standard JS array format: [[1,2],[3,4]].
      * SYSTEMS: For multiple equations, separate them with commas (e.g., "x+y=1, x-y=2").
      * Example: "integrate sin(x) dx" -> expression: "sin(x)"
      * Example: "y = x^2 + 2" -> expression: "x^2 + 2"
    - variable: The independent variable(s) (e.g., "x", "n", or "x,y" for systems). Default to "x".
    - start: (Optional) Lower bound for integrals/sums, OR center point for Taylor series (default 0).
    - end: (Optional) Upper bound for integrals/sums, OR order/terms for Taylor series (default 4).
    - preferredEngine: (Optional) "nerdamer" or "algebrite".
      * ALWAYS use "algebrite" for: Specialized functions like 'hilbert', 'legendre', 'bessel', 'circular' matrices, 'roots', 'factor', 'hermite', 'chebyshev', 'laguerre'.
      * Use "nerdamer" for: Standard 'integrate', 'differentiate', 'solve' (linear systems), 'limit', 'determinant', 'invert'.
      * If unsure, default to "nerdamer".

    Examples:
    1. "Integrate sin(x)" -> { "operation": "integrate", "expression": "sin(x)", "variable": "x", "preferredEngine": "nerdamer" }
    2. "Integrate x^2 from 0 to 10" -> { "operation": "integrate", "expression": "x^2", "variable": "x", "start": "0", "end": "10", "preferredEngine": "nerdamer" }
    3. "Sum of 1/n! from 1 to infinity" -> { "operation": "sum", "expression": "1/factorial(n)", "variable": "n", "start": "1", "end": "Infinity", "preferredEngine": "nerdamer" }
    4. "Solve x^2 - 4 = 0" -> { "operation": "solve", "expression": "x^2 - 4 = 0", "variable": "x", "preferredEngine": "nerdamer" }
    5. "Determinant of [[1,2],[3,4]]" -> { "operation": "determinant", "expression": "[[1,2],[3,4]]", "preferredEngine": "nerdamer" }
    6. "Taylor series of cos(x) at 0" -> { "operation": "taylor", "expression": "cos(x)", "variable": "x", "start": "0", "end": "4", "preferredEngine": "nerdamer" }
    7. "Solve x+y=5, x-y=1" -> { "operation": "solve", "expression": "x+y=5, x-y=1", "variable": "x,y", "preferredEngine": "nerdamer" }
    8. "Hilbert matrix of size 3" -> { "operation": "evaluate", "expression": "hilbert(3)", "preferredEngine": "algebrite" }
    
    Return ONLY valid raw JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [{ text: query }] },
    config: {
      systemInstruction: systemInstruction,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  let text = response.text || '';
  
  // Use shared robust extraction for math commands too
  // We look for "operation" key to find the start
  const jsonText = extractJSON(text, 'operation');

  try {
    return JSON.parse(jsonText) as MathCommand;
  } catch (e) {
    console.error("Failed to parse math command JSON", text);
    // Fallback simple evaluate with raw query, though likely to fail in pure symbolic mode
    return { operation: 'evaluate', expression: query, preferredEngine: 'nerdamer' };
  }
};
