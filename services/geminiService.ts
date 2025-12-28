import { GoogleGenAI, Type } from "@google/genai";
import { SolverResponse, ModelMode } from "../types";

// ... [Keep existing types if needed, or we can clean up later] ...

// Helper: Extract JSON
const extractJSON = (raw: string): string => {
  let text = raw.trim();
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) return jsonBlockMatch[1];
  
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  return text; 
};

export const generateCode = async (query: string, mode: 'symbolic' | 'numerical' | 'reasoning'): Promise<{ code: string }> => {
  const apiKey = process.env.API_KEY || (window as any).env?.API_KEY; // Fallback for runtime injection
  if (!apiKey) throw new Error("API Key not found");
  
  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3-pro-preview';

  let systemInstruction = "";

  if (mode === 'symbolic') {
    systemInstruction = `
      You are an expert Symbolic Mathematics Engineer.
      Your goal is to write JAVASCRIPT code that solves the user's problem using the 'nerdamer' or 'algebrite' libraries.
      
      LIBRARIES AVAILABLE (Global Scope):
      - nerdamer: Use nerdamer('expression') to solve.
        - e.g. nerdamer('integrate(x^2, x)')
        - e.g. nerdamer('solve(x^2+2x+1=0, x)')
      - algebrite: Use algebrite.run('expression')
      
      OUTPUT FORMAT:
      - You must return raw JavaScript code.
      - The code will be executed in a function body.
      - USE 'console.log(text)' to print steps or info to the output console.
      - USE 'return result' at the end to display the final result.
      - DO NOT wrap in markdown code blocks in the final JSON "code" field.

      Example:
      console.log("Integrating function...");
      const result = nerdamer('integrate(x^2, x)').toString();
      return result;
    `;
  } else if (mode === 'numerical') {
    systemInstruction = `
      You are an expert Numerical Analysis Engineer.
      Your goal is to write JAVASCRIPT code that solves the user's problem using 'mathjs' and visualizes it with 'plot'.

      LIBRARIES AVAILABLE (Global Scope):
      - math: Full mathjs library. (e.g. math.mean, math.matrix, math.evaluate)
      - plot(data, layout): Function to render Plotly charts.
        - data: Array of Plotly traces (e.g. [{x: [...], y: [...], type: 'scatter'}])
        - layout: Plotly layout object (e.g. {title: 'My Plot'})

      OUTPUT FORMAT:
      - Return raw JavaScript code.
      - USE 'console.log(text)' for status updates.
      - USE 'plot(data, layout)' to visualize results.
      - USE 'return result' for text answers.

      Example:
      const x = math.range(0, 10, 0.1).toArray();
      const y = x.map(val => math.sin(val));
      plot([{x, y, type: 'scatter'}], {title: 'Sine Wave'});
      return "Plot generated successfully.";
    `;
  } else {
    // Reasoning Mode
    systemInstruction = `
      You are a Deep Reasoning Engine.
      Your goal is to solve the problem using pure logic and reasoning, but output the result as JavaScript that constructs a Markdown response.

      OUTPUT FORMAT:
      - Return raw JavaScript.
      - The code should simply build a string or formatted object and return it.

      Example:
      console.log("Analyzing physics problem...");
      // ... reasoning steps ...
      return "**Answer:** The velocity is 50 m/s.";
    `;
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: query,
    config: {
      systemInstruction: systemInstruction,
      thinkingConfig: { thinkingBudget: 4096 }, // High budget for correct code generation
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING, description: "The executable JavaScript code." }
        },
        required: ["code"]
      }
    },
  });

  const raw = response.text || "{}";
  try {
    const cleaned = extractJSON(raw);
    return JSON.parse(cleaned) as { code: string };
  } catch (e) {
    // Fallback if JSON parsing fails, try to return raw text as code if it looks like code
    return { code: `return "${raw.replace(/"/g, '\\"')}";` };
  }
};

// Keep existing solver for backward compatibility or direct use if needed
export const solveQuery = async (query: string, mode: ModelMode = 'pro', imageBase64?: string, audioBase64?: string, context?: { previousQuery: string; previousResult: string }): Promise<SolverResponse> => {
   // ... (Legacy implementation kept minimal or redirected if we want full replacement)
   // For now, let's just return a placeholder so the build doesn't break if anything still imports it
   return {
     interpretation: "Legacy Mode",
     result: [{ type: 'text', content: "Please use the new Workbench tools." }],
     confidenceScore: 1,
     sections: []
   };
};
