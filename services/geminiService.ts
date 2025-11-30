import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SolverResponse, ModelMode } from "../types";

// Helper to ensure API key presence
const getApiKey = (): string => {
  const key = process.env.API_KEY;
  if (!key) {
    console.error("API_KEY is missing from environment variables.");
    throw new Error("API Key not found. Please check your configuration.");
  }
  return key;
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

export const solveQuery = async (
  query: string, 
  mode: ModelMode = 'pro',
  imageBase64?: string,
  audioBase64?: string
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
    8.  **Code**: If code is requested or relevant, put it in a separate section with type "code". Do not mix code blocks inside "text" sections if possible.
    9.  **Multimodal**: 
        - If an image is provided, analyze it thoroughly.
        - If AUDIO is provided, listen to the speech carefully, interpret the problem described, and solve it.
    10. **Suggestions**: Generate 3-5 "smart actions" or follow-up questions. 
        - If Math: "Solve for x", "Graph it", "Show derivative", "Step-by-step".
        - If Data: "Compare with [Related]", "Show history", "Visualize".
        - General: "Explain simply", "More details", "Translate to Spanish".

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

    // Manual cleanup of potential markdown formatting since we aren't using strict JSON mode
    text = text.trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let parsed: SolverResponse;
    try {
      parsed = JSON.parse(text) as SolverResponse;
    } catch (e) {
      console.error("JSON Parse Error", text);
      throw new Error("Failed to parse AI response. The model did not return valid JSON.");
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

    return parsed;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export interface MathCommand {
  operation: 'integrate' | 'differentiate' | 'solve' | 'simplify' | 'factor' | 'limit' | 'sum' | 'evaluate';
  expression: string;
  variable?: string;
  start?: string;
  end?: string;
}

export const parseMathCommand = async (query: string): Promise<MathCommand> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const systemInstruction = `
    You are a math syntax parser. Your goal is to map natural language math queries into a specific structured JSON command object.
    
    Operations: 
    - "integrate" (for both definite and indefinite integrals)
    - "differentiate" (derivatives)
    - "solve" (finding roots, solving equations)
    - "simplify" (algebraic simplification)
    - "factor" (factoring polynomials)
    - "limit"
    - "sum" (summations)
    - "evaluate" (basic arithmetic or function evaluation)

    Fields:
    - operation: The operation type.
    - expression: The mathematical expression (e.g., "sin(x)", "x^2 + 2x"). Format it for standard computer algebra systems (e.g. use "*" for multiplication).
    - variable: The independent variable (e.g., "x", "n"). Default to "x".
    - start: (Optional) Lower bound for integrals or sums.
    - end: (Optional) Upper bound for integrals or sums. Use "Infinity" for infinity.

    Examples:
    1. "Integrate sin(x)" -> { "operation": "integrate", "expression": "sin(x)", "variable": "x" }
    2. "Integrate x^2 from 0 to 10" -> { "operation": "integrate", "expression": "x^2", "variable": "x", "start": "0", "end": "10" }
    3. "Sum of 1/n! from 1 to infinity" -> { "operation": "sum", "expression": "1/factorial(n)", "variable": "n", "start": "1", "end": "Infinity" }
    4. "Solve x^2 - 4 = 0" -> { "operation": "solve", "expression": "x^2 - 4 = 0", "variable": "x" }
    
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
  text = text.trim();
  text = text.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
  
  try {
    return JSON.parse(text) as MathCommand;
  } catch (e) {
    console.error("Failed to parse math command JSON", text);
    // Fallback simple evaluate
    return { operation: 'evaluate', expression: query };
  }
};
