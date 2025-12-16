
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

// Helper: Promise Timeout Wrapper to prevent hanging requests
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
  
  // Handle structured error objects coming directly from the API response
  if (error.error) {
      if (error.error.message) {
          msg = error.error.message;
      }
      if (error.error.code === 429 || error.error.status === 'RESOURCE_EXHAUSTED') {
          msg = "Quota exceeded"; 
      }
  }

  const lowerMsg = msg.toLowerCase();

  // Handle Quota/Rate Limits (429)
  if (lowerMsg.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('resource_exhausted')) {
    throw new Error("⚠️ API Quota Exceeded. You have reached the usage limit for your API key.");
  }
  
  // Handle Auth Errors (400/403)
  if (lowerMsg.includes('api_key') || lowerMsg.includes('403') || lowerMsg.includes('key not valid')) {
    throw new Error("⚠️ Invalid API Key. Please check your .env configuration.");
  }

  // Handle Server Errors (500/503)
  if (lowerMsg.includes('503') || lowerMsg.includes('overloaded') || lowerMsg.includes('internal')) {
    throw new Error("⚠️ AI Service Overloaded. Please try again in a few seconds.");
  }
  
  // Handle Timeouts
  if (lowerMsg.includes('timed out')) {
     throw new Error("⚠️ Request Timed Out. The model took too long to respond.");
  }

  // Filter out raw JSON if possible
  if (msg.includes('{')) {
      try {
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

// Define the schema definition string for the prompt
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
  
  // 1. Try markdown code block
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) return jsonBlockMatch[1];
  
  const genericBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (genericBlockMatch) return genericBlockMatch[1];

  // 2. Try finding the outer braces if raw text
  // We look for the first '{' and the last '}'
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
       return text.substring(firstBrace, lastBrace + 1);
  }

  // 3. Fallback: if no braces found, it might be plain text. Return as is, parser will fail.
  return text; 
};

// Internal function to attempt generation with specific model
const attemptGenerate = async (
    modelMode: ModelMode,
    parts: any[]
): Promise<SolverResponse> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    // Switch to gemini-2.5-pro for Pro mode to reduce rate limiting while keeping high intelligence
    const modelName = modelMode === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    // Use conservative thinking budget to help with quota issues, or 0 for flash
    const thinkingBudget = modelMode === 'pro' ? 2048 : 0; 

    // Prompt engineering
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
      4.  **Accuracy**: Use the googleSearch tool if the query requires up-to-date information.
      5.  **Format**: Return ONLY valid raw JSON matching the schema below.
    `;

    if (modelMode === 'flash') {
      systemInstruction += `
      [MODE: FLASH - SPEED & RELIABILITY]
      - You are in a recovery mode. SPEED and JSON COMPLIANCE are the top priorities.
      - Do not generate long explanations.
      - Return the answer in the specific JSON structure provided.
      - 'result' should be direct. 'sections' can be minimal.
      - NO Charts.
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
    
    // Append Schema at the end to maximize adherence
    systemInstruction += `\n\nJSON SCHEMA:\n${schemaDefinition}`;

    // Set Timeout: 45s for Pro (thinking takes time), 20s for Flash
    const timeoutMs = modelMode === 'pro' ? 45000 : 20000;

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

    let text = response.text || "";
    if (!text) throw new Error("No response content received from Gemini.");

    const jsonText = extractJSON(text, 'interpretation');
    let parsed: SolverResponse;
    try {
      parsed = JSON.parse(jsonText) as SolverResponse;
    } catch (e) {
      try {
        // Simple repair for common JSON issues (newlines in strings, etc)
        const repaired = jsonText.replace(/\\(?!(["\\/bfnrt]|u[0-9a-fA-F]{4}))/g, "\\\\");
        parsed = JSON.parse(repaired) as SolverResponse;
        console.warn("Original JSON parse failed, but repair was successful.");
      } catch (repairError) {
        console.warn("JSON Parse Failed. Fallback to raw text.");
        const raw = text.trim();
        // If we really can't parse JSON, we wrap the raw text in a valid response structure
        // This ensures the app always shows *something*
        parsed = {
            interpretation: "System Response (Unstructured)",
            result: [{ type: 'markdown', content: raw }],
            confidenceScore: 0.5,
            sections: [],
            suggestions: ["Refine Query"]
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
    if (!parsed.interpretation) parsed.interpretation = "Result";
    if (!parsed.sections) parsed.sections = [];

    return parsed;
};

export const solveQuery = async (
  query: string, 
  mode: ModelMode = 'pro',
  imageBase64?: string,
  audioBase64?: string,
  context?: { previousQuery: string; previousResult: string }
): Promise<SolverResponse> => {

  // Prepare Parts
  const parts: any[] = [];
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
    parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Data } });
  }

  if (audioBase64) {
     const base64Data = audioBase64.split(',')[1] || audioBase64;
     parts.push({ inlineData: { mimeType: "audio/webm", data: base64Data } });
  }

  if (parts.length === 0) {
      throw new Error("No input provided (text, image, or audio).");
  }

  try {
    // Attempt 1: Try with requested mode
    return await attemptGenerate(mode, parts);
  } catch (error: any) {
    // FALLBACK LOGIC
    const isPro = mode === 'pro';
    const msg = error.message || error.toString();
    const lowerMsg = msg.toLowerCase();
    
    // Check if error is recoverable via model switch (Quota, Timeout, Server Error)
    const isQuota = lowerMsg.includes("429") || lowerMsg.includes("quota") || lowerMsg.includes("resource_exhausted");
    const isTimeout = lowerMsg.includes("timed out");
    const isServerErr = lowerMsg.includes("503") || lowerMsg.includes("overloaded");

    if (isPro && (isQuota || isTimeout || isServerErr)) {
        console.warn(`Pro model failed (${msg}). Falling back to Flash.`);
        try {
            const flashResult = await attemptGenerate('flash', parts);
            
            // Annotate the result to inform the user
            let note = "(⚡ Switched to Flash model due to high traffic)";
            if (isTimeout) note = "(⚡ Switched to Flash model due to timeout)";
            
            flashResult.interpretation = flashResult.interpretation 
                ? `${flashResult.interpretation} ${note}`
                : `Result ${note}`;
                
            return flashResult;
        } catch (fallbackError) {
            // If fallback also fails, throw the original or fallback error
            handleGeminiError(fallbackError);
        }
    }

    handleGeminiError(error);
  }
};

export interface MathCommand {
  operation: string; // Generalized to string to allow unsupported ops like 'fourier'
  expression: string;
  variable?: string;
  start?: string;
  end?: string;
  preferredEngine?: 'nerdamer' | 'algebrite';
}

export const parseMathCommand = async (query: string): Promise<MathCommand> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  // Use Gemini 2.5 Pro for parsing. It offers better rate limits than 3-Pro-Preview
  // while still maintaining excellent reasoning capabilities for syntax generation.
  const modelName = 'gemini-2.5-pro';
  const thinkingBudget = 2048; 

  const systemInstruction = `
    You are a Math Syntax Expert and Command Generator for symbolic math engines (Nerdamer, Algebrite).
    Your goal is to normalize natural language math queries into a strict, standardized JSON structure.

    OUTPUT JSON SCHEMA:
    {
      "operation": "string", 
      "expression": "string",
      "variable": "string (optional, default 'x')",
      "start": "string (optional)",
      "end": "string (optional)",
      "preferredEngine": "nerdamer" | "algebrite" (optional)
    }

    NORMALIZATION RULES (CRITICAL):
    1. **Infinity**: ALWAYS map 'inf', 'infinity', 'forever' to the string "Infinity".
       - Incorrect: "inf"
       - Correct: "Infinity"
    2. **Constants**: Map 'pi' to 'PI' (unless it's a variable), 'e' to 'E'.
    3. **Expression Cleanup**:
       - Ensure function parentheses: 'sin x' -> 'sin(x)'
       - Ensure explicit multiplication: '2x' -> '2*x' (optional but safer)
       - Matrix: '[[1,2],[3,4]]' format is standard.
    4. **Operation Mapping**:
       - "Limit of 1/x as x goes to infinity" 
         -> { "operation": "limit", "expression": "1/x", "variable": "x", "end": "Infinity" }
       - "Integrate x^2 from 0 to 5"
         -> { "operation": "integrate", "expression": "x^2", "variable": "x", "start": "0", "end": "5" }
       - "Derive/Differentiate tan(x)"
         -> { "operation": "differentiate", "expression": "tan(x)", "variable": "x" }
       - "Solve x^2 - 1 = 0"
         -> { "operation": "solve", "expression": "x^2 - 1 = 0", "variable": "x" }
    
    5. **Operation Types**: 
       Supported: integrate, differentiate, solve, simplify, factor, limit, sum, evaluate, determinant, invert, taylor.
       If complex (e.g. Fourier), return that specific name (e.g. "fourierTransform").
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: query }] },
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget }, // Enable thinking for better parsing
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

export const validateMathResult = async (query: string, result: string): Promise<{ isValid: boolean; reason?: string }> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const systemInstruction = `
    You are a Strict Math Validator.
    Your task is to verify if the 'Computed Result' is a valid, solved mathematical answer to the 'User Query'.
    
    Check for:
    1. **Echoing**: Is the result just the input query repeated (e.g. "integrate x" -> "integrate(x)")? This is INVALID.
    2. **Intermediate Forms**: Does the result contain unprocessed terms like "inf^(-1)" or "limit(...)"? This is INVALID. It should be simplified (e.g. "0").
    3. **Unsolved Functions**: Does the result contain function calls like 'integrate(...)', 'diff(...)', 'defint(...)'? This is INVALID.
    4. **Error Messages**: Does it look like an error (e.g. "Stop", "nil", "undefined")? This is INVALID.
    
    Return JSON:
    { 
      "isValid": boolean, 
      "reason": "short explanation of why it is valid or invalid" 
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: `User Query: "${query}"\nComputed Result: "${result}"` }] },
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json'
      }
    });

    const jsonText = extractJSON(response.text || '', 'isValid');
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Validation API error", error);
    return { isValid: true, reason: "Validation service unavailable, assuming valid." };
  }
};

export const explainMathResult = async (query: string, result: string, engine: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const systemInstruction = `
    You are a math tutor. Your goal is to explain how to derive the result for the user's math problem step-by-step.
    
    CONTEXT:
    - User Query: "${query}"
    - Computed Result: "${result}"
    - Engine Used: "${engine}"

    INSTRUCTIONS:
    1. Verify the result if possible, but primarily explain the method to reach it.
    2. Provide clear, step-by-step derivation.
    3. Use LaTeX for math equations, wrapped in single $ for inline and double $$ for block equations.
    4. Keep the tone helpful and educational.
    5. Format with Markdown (bolding, lists).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Use gemini-2.5-flash which is a valid model ID
      contents: { parts: [{ text: "Explain the steps." }] },
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 16384 }, // Increase thinking budget for "Pro" like behavior
      }
    });

    return response.text || "No explanation provided.";
  } catch (error) {
    console.error("Explanation failed", error);
    return "Could not generate explanation due to an error.";
  }
};

export const solveMathWithAI = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const systemInstruction = `
    You are a symbolic math engine. Your task is to solve the user's math problem and provide the final result in LaTeX.
    
    RULES:
    1. Output ONLY the final mathematical result in LaTeX format.
    2. Wrap the result in block math delimiters: $$ ... $$
    3. Do not include explanations, steps, or markdown text outside the LaTeX block.
    4. If the result is "No solution" or undefined, say so clearly in text.
    5. Handle complex requests like Fourier transforms, Laplace transforms, eigenvectors, etc.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Use gemini-2.5-flash which is a valid model ID
      contents: { parts: [{ text: query }] },
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 16384 }, // Increase thinking budget for "Pro" like behavior
      }
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.error("AI Fallback error:", error);
    return "";
  }
};
