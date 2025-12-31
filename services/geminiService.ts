import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { CodeGenerationResponse } from "../types";

// --- Configuration ---
// Chat / Code Generation Models
// Chat / Code Generation Models
export const AVAILABLE_MODELS = [
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' },
];

const CHAT_MODEL_DEFAULT = 'gemini-3-pro';
const CHAT_MODEL_FALLBACK = 'gemini-3-flash';

// Report Generation Models
const REPORT_MODEL_PRIMARY = 'gemini-2.5-pro';
// Fallback to a known working model if the pro model fails
const REPORT_MODEL_FALLBACK = 'gemini-3-flash';

// --- Helpers ---

// Extract JSON from potentially messy model output
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

// Safely get API key at runtime
const getApiKey = (): string => {
  if (typeof window !== 'undefined' && (window as any).GEMINI_API_KEY) {
    return (window as any).GEMINI_API_KEY;
  }
  return process.env.GEMINI_API_KEY || process.env.API_KEY || '';
};

// Generic Fallback Verification Wrapper
const generateWithFallback = async (
  parts: any[],
  systemInstruction: string,
  primaryModel: string,
  fallbackModel: string,
  jsonSchema?: any
): Promise<any> => {
  const genAI = new GoogleGenerativeAI(getApiKey());

  const config: any = {
    systemInstruction,
  };

  if (jsonSchema) {
    config.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: jsonSchema
    };
  }

  // Helper to run a specific model
  const runModel = async (modelName: string) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      ...config
    });
    return await model.generateContent(parts);
  };

  try {
    // Try Primary
    console.log(`[Gemini] Attempting generation with ${primaryModel}...`);
    return await runModel(primaryModel);
  } catch (error: any) {
    console.warn(`[Gemini] Primary model ${primaryModel} failed:`, error.message);
    console.warn(`[Gemini] Falling back to ${fallbackModel}...`);

    // Try Fallback
    try {
      return await runModel(fallbackModel);
    } catch (fallbackError: any) {
      console.error(`[Gemini] Fallback model ${fallbackModel} also failed:`, fallbackError.message);
      throw fallbackError; // Re-throw if both fail
    }
  }
};

// --- Exported Services ---

export const generateCodeFromPrompt = async (query: string, previousCode?: string, mathMode: 'numerical' | 'symbolic' | 'auto' = 'auto', images?: string[], model?: string): Promise<CodeGenerationResponse> => {
  // Use selected model or default
  const primaryModel = model || CHAT_MODEL_DEFAULT;

  const parts: any[] = [];

  if (previousCode) {
    parts.push({ text: `Current Code:\n\`\`\`javascript\n${previousCode}\n\`\`\`` });
  }

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
            4. **CRITICAL: FORMATTING**:
               - Use proper newlines between statements.
               - Do NOT minify or one-line the code.
               - Add blank lines between logical sections.
               - Ensure readability is high.
            
            MODE SPECIFIC INSTRUCTIONS:
            - IF MODE IS 'NUMERICAL':
                - Use 'math.evaluate()' / 'math.matrix()' for complex calculations.
            - IF MODE IS 'SYMBOLIC':
                - Use 'nerdamer' (preferred for solving equations).
                - Use 'Algebrite' (preferred for calculus/integrals, simplification).
                  - Ex: \`const res = Algebrite.run('simplify(a+a)');\`
                  - Ex: \`const area = Algebrite.run('defint(x^2, x, 0, 1)');\`
                - **OUTPUT FORMATTING**:
                  - Always \`print()\` or \`console.log()\` your final results.
                  - Use descriptive labels. Ex: \`print('Solutions:', solutions.toString())\`.
                  - Ensure complex objects are converted to strings if needed.
            - IF MODE IS 'AUTO' (Recommended):
                - INTELLIGENTLY MIX libraries.
                - **Solving**: Use 'nerdamer' ('solve').
                - **Calculus (Integrals)**: Use 'Algebrite'. Ex: \`Algebrite.run('defint(x^2, x, 0, 1)')\`.
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

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      code: { type: SchemaType.STRING, description: "The executable JavaScript code" },
      explanation: { type: SchemaType.STRING, description: "Brief explanation of what the code does" }
    },
    required: ["code", "explanation"]
  };

  const result = await generateWithFallback(
    parts,
    systemInstruction,
    primaryModel,
    CHAT_MODEL_FALLBACK,
    responseSchema
  );

  const raw = result.response.text() || "{}";
  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned) as CodeGenerationResponse;
};

export const reviewCode = async (code: string, userMessage: string, mathMode: 'numerical' | 'symbolic' | 'auto'): Promise<{ message: string; fixedCode?: string }> => {
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

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      message: { type: SchemaType.STRING },
      fixedCode: { type: SchemaType.STRING, nullable: true }
    },
    required: ["message"]
  };

  const result = await generateWithFallback(
    parts,
    systemInstruction,
    CHAT_MODEL_DEFAULT,
    CHAT_MODEL_FALLBACK,
    responseSchema
  );

  const raw = result.response.text() || "{}";
  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned);
};

export const generateCommand = async (userInput: string): Promise<string> => {
  // Specialized, valid JS one-liner prompt
  const systemInstruction = `You are a Command Line Interface (CLI) Assistant.
    Your task is to convert the User's Natural Language Command into a SINGLE LINE of Valid JavaScript.
    
    Environment:
    - Math.js is available as 'math'.
    - Nerdamer is available as 'nerdamer'.
    - Algebrite is available as 'Algebrite'.
    - 'print(...)' and 'plot(...)' are available.

    Rules:
    1. Output strictly ONLY the JavaScript code. No markdown, no json, no explanation.
    2. Must be a single executable line (semicolons allowed).
    3. Prefer Nerdamer for solving/algebra.
    4. Prefer Algebrite for calculus.
    
    Examples:
    Input: "solve x^2 - 1 = 0"
    Output: print("Solutions:", nerdamer.solve('x^2 - 1 = 0', 'x').toString())

    Input: "graph sin x from 0 to 10"
    Output: { const x=[], y=[]; for(let i=0;i<=100;i++){ let v=i/10; x.push(v); y.push(Math.sin(v)); } plot([{x,y}]); }

    Input: "set a to 50"
    Output: var a = 50; print("a set to", a);
    `;

  const parts = [{ text: userInput }];

  try {
    const result = await generateWithFallback(
      parts,
      systemInstruction,
      'gemini-3-flash', // Use Flash as requested
      'gemini-2.5-flash'
    );
    let code = result.response.text().trim();
    // Strip markdown if model misbehaves
    code = code.replace(/```(javascript|js)?/g, '').replace(/```/g, '').trim();
    return code;
  } catch (e: any) {
    console.error("Smart Command Error:", e);
    return `print("Error interpreting command: ${e.message.replace(/"/g, "'")}")`;
  }
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
    const result = await generateWithFallback(
      parts,
      REPORT_SYSTEM_PROMPT,
      REPORT_MODEL_PRIMARY,
      REPORT_MODEL_FALLBACK
    );

    let markdown = result.response.text();

    // Post-process: Replace placeholders with actual Data URIs
    if (images) {
      images.forEach((img, idx) => {
        const placeholder = `{{PLOT_IMAGE_${idx}}}`;

        // 1. Check for placeholder inside backticks (model often puts it in `code`)
        // Regex: backtick + spaces + {{PLOT_IMAGE_n}} + spaces + backtick
        const codeBlockRegex = new RegExp(`\`\\s*\\{\\{\\s*PLOT_IMAGE_${idx}\\s*\\}\\}\\s*\``, 'g');

        // 2. Standard Regex
        const standardRegex = new RegExp(`\\{\\{\\s*PLOT_IMAGE_${idx}\\s*\\}\\}`, 'g');

        const imageMarkdown = `\n\n![Generated Plot](${img})\n\n`;

        if (markdown.match(codeBlockRegex)) {
          console.log(`[Report] Found backticked placeholder for image ${idx}. Stripping backticks and replacing.`);
          markdown = markdown.replace(codeBlockRegex, imageMarkdown);
        } else if (markdown.match(standardRegex)) {
          console.log(`[Report] Found standard placeholder for image ${idx}. Replacing.`);
          markdown = markdown.replace(standardRegex, imageMarkdown);
        } else {
          console.warn(`[Report] Model ignored plot placeholder ${placeholder}. Appending image manually.`);
          markdown += imageMarkdown;
        }
      });
    }

    return markdown;
  } catch (error: any) {
    return `# Report Generation Failed\n\nError: ${error.message}`;
  }
};

export const editReport = async (currentMarkdown: string, userPrompt: string): Promise<string> => {
  const parts = [
    { text: `Original Document:\n${currentMarkdown}` },
    { text: `User Edit Request: "${userPrompt}"` }
  ];

  const systemInstruction = "You are a helpful AI editor improving a scientific report. Return ONLY the updated markdown. Maintain existing structure and formatting.";

  try {
    const result = await generateWithFallback(
      parts,
      systemInstruction,
      REPORT_MODEL_PRIMARY,
      REPORT_MODEL_FALLBACK
    );
    return result.response.text();
  } catch (error: any) {
    return `Error updating report: ${error.message}`;
  }
};
