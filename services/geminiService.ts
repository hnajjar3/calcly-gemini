import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { CodeGenerationResponse } from "../types";

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

// Helper to safely get API key at runtime
const getApiKey = (): string => {
  if (typeof window !== 'undefined' && (window as any).GEMINI_API_KEY) {
    return (window as any).GEMINI_API_KEY;
  }
  return process.env.GEMINI_API_KEY || process.env.API_KEY || '';
};

const MODEL_NAME = 'gemini-2.0-flash-exp';

export const generateCodeFromPrompt = async (query: string, previousCode?: string, mathMode: 'numerical' | 'symbolic' | 'auto' = 'auto', images?: string[]): Promise<CodeGenerationResponse> => {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const parts: any[] = [];

  if (previousCode) {
    parts.push({ text: `Current Code:\n\`\`\`javascript\n${previousCode}\n\`\`\`` });
  }

  // Add images if present
  if (images && images.length > 0) {
    images.forEach(base64 => {
      const match = base64.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        });
      }
    });
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
                - 'interact(controls, callback)' (Interactive Plots)
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
                - **OUTPUT FORMATTING**:
                  - Always \`print()\` or \`console.log()\` your final results.
                  - Use descriptive labels. Ex: \`print('Solutions:', solutions.toString())\`.
                  - Ensure complex objects are converted to strings if needed.
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
            - IF USER ASKS FOR INTERACTIVE PLOTS:
                - Use 'interact({ param: { min, max, value, step } }, (values) => { ... plot(...) })'.
                - Example:
                  \`
                  interact({ f: { min: 1, max: 10, value: 5 } }, ({ f }) => {
                    const x = []; const y = [];
                    for(let i=0; i<100; i++) { x.push(i/10); y.push(Math.sin(f * i/10)); }
                    plot([{x, y}]);
                  });
                  \`
            
            Output JSON ONLY.`;

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          code: { type: SchemaType.STRING, description: "The executable JavaScript code" },
          explanation: { type: SchemaType.STRING, description: "Brief explanation of what the code does" }
        },
        required: ["code", "explanation"]
      }
    }
  });

  const result = await model.generateContent(parts);
  const raw = result.response.text() || "{}";
  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned) as CodeGenerationResponse;
};

export const reviewCode = async (code: string, userMessage: string, mathMode: 'numerical' | 'symbolic' | 'auto'): Promise<{ message: string; fixedCode?: string }> => {
  const genAI = new GoogleGenerativeAI(getApiKey());
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

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          message: { type: SchemaType.STRING },
          fixedCode: { type: SchemaType.STRING, nullable: true }
        },
        required: ["message"]
      }
    }
  });

  const result = await model.generateContent(parts);
  const raw = result.response.text() || "{}";
  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned);
};

const REPORT_SYSTEM_PROMPT = `You are a Scientific Publisher.
Convert the provided code execution data into a professional "document-style" report.

Structure:
# [Title]
## Executive Summary
[Bullet points...]
## Methodology
[Explanation...]
   - IMPORTANT: Use block math '$$...$$' for all main equations so they are centered.
## Results
[Findings...]
## Conclusion
[Wrap-up]

Formatting:
- Use standard Markdown headers (#, ##, ###).
- Use double dollar signs '$$' for centered display math.
- Do NOT include the raw code unless relevant for snippets.
- Make it look like a finished paper.`;

export const generateReport = async (code: string, logs: string, variables: string, images?: string[]): Promise<string> => {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: REPORT_SYSTEM_PROMPT
  });

  let promptText = `
Generate a scientific report for the following code execution:

CODE:
${code}

LOGS:
${logs}

VARIABLES:
${variables}
`;

  if (images && images.length > 0) {
    promptText += `\n\nNOTE: A plot image has been provided. Please analyze this plot and include it in the "Results" or "Visualization" section of the report. 
IMPORTANT: To insert the plot, use the exact placeholder text "{{PLOT_IMAGE_0}}" (without quotes) in your markdown. Do not try to generate a data URI yourself, just use the placeholder. 
Example:
![Damped Sine Wave Visualization]({{PLOT_IMAGE_0}})
    `;
  }

  // Construct parts: Text + Images
  const parts: any[] = [{ text: promptText }];
  if (images) {
    images.forEach(imgBase64 => {
      // strip header if present for API, but keep it for replacement later
      // API expects just base64 data
      const base64Data = imgBase64.split(',')[1];
      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: base64Data
          }
        });
      }
    });
  }

  try {
    const result = await model.generateContent(parts);
    let markdown = result.response.text();

    // Post-process: Replace placeholders with actual Data URIs
    if (images) {
      images.forEach((img, idx) => {
        markdown = markdown.replace(new RegExp(`\\{\\{PLOT_IMAGE_${idx}\\}\\}`, 'g'), img);
      });
    }

    return markdown;
  } catch (error: any) {
    return `# Report Generation Failed\n\nError: ${error.message}`;
  }
};

export const editReport = async (currentMarkdown: string, userPrompt: string): Promise<string> => {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: "You are a helpful AI editor improving a scientific report. Return ONLY the updated markdown. Maintain existing structure and formatting."
  });

  const parts = [
    { text: `Original Document:\n${currentMarkdown}` },
    { text: `User Edit Request: "${userPrompt}"` }
  ];

  try {
    const result = await model.generateContent(parts);
    return result.response.text();
  } catch (error: any) {
    return `Error updating report: ${error.message}`;
  }
};
