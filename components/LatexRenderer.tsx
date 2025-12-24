import React from 'react';

declare const katex: any;

interface Props {
  content: string;
  className?: string;
  renderMarkdown?: boolean;
}

export interface LatexToken {
  type: 'text' | 'block' | 'inline';
  content: string;
}

/**
 * Robustly converts string representations of matrices like [[1,2],[3,4]] 
 * into LaTeX bmatrix notation.
 */
export const formatMatrixToLatex = (str: string): string => {
  if (typeof str !== 'string' || !str.trim()) return str;
  const trimmed = str.trim();
  
  // Detect nested array structure: [[...], [...]]
  if (/^\[\s*\[[\s\S]*\]\s*\]$/.test(trimmed)) {
    try {
      // Remove outer brackets
      const inner = trimmed.slice(1, -1).trim();
      // Match individual rows: [a, b, c]
      const rows = inner.match(/\[[\s\S]*?\]/g);
      
      if (rows && rows.length > 0) {
        const latexRows = rows.map(row => {
          // Remove row brackets
          const content = row.slice(1, -1).trim();
          // Split by comma, but be careful with nested commas (though rare in simple matrices)
          return content.split(',').map(val => {
            let cleaned = val.trim();
            // Basic cleanup for Nerdamer/Algebrite output quirks
            cleaned = cleaned.replace(/\*/g, '');
            // Convert fractions to better looking decimals or stay symbolic
            if (/^-?\d+\/\d+$/.test(cleaned)) {
              const [n, d] = cleaned.split('/').map(Number);
              if (d !== 0 && Math.abs(n/d) < 1000) return parseFloat((n / d).toFixed(4)).toString();
            }
            return cleaned;
          }).join(' & ');
        });
        return `\\begin{bmatrix} ${latexRows.join(' \\\\ ')} \\end{bmatrix}`;
      }
    } catch (e) {
      console.warn("Matrix formatting failed, falling back to raw string", e);
    }
  }
  return str;
};

// Robust manual tokenizer to avoid Regex Lookbehind issues on older iOS/Safari
export const splitLatex = (text: string): LatexToken[] => {
  const tokens: LatexToken[] = [];
  let i = 0;
  let lastIndex = 0;

  while (i < text.length) {
    // Check for Block Math $$
    if (text.startsWith('$$', i) && (i === 0 || text[i - 1] !== '\\')) {
      // Found potential block start
      let j = i + 2;
      let foundEnd = false;
      while (j < text.length) {
         // Check for block end $$
         if (text.startsWith('$$', j) && text[j - 1] !== '\\') {
           foundEnd = true;
           break;
         }
         j++;
      }

      if (foundEnd) {
        // Flush preceding text only when we confirm we found a block
        if (i > lastIndex) {
          tokens.push({ type: 'text', content: text.slice(lastIndex, i) });
        }
        tokens.push({ type: 'block', content: text.slice(i + 2, j) });
        i = j + 2;
        lastIndex = i;
        continue;
      }
    }

    // Check for Inline Math $
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) {
       // Condition: Not followed by space (Currency check)
       if (i + 1 < text.length && /\s/.test(text[i+1])) {
          i++; 
          continue;
       }

       let j = i + 1;
       let foundEnd = false;
       while (j < text.length) {
         if (text[j] === '$' && text[j - 1] !== '\\') {
            foundEnd = true;
            break;
         }
         j++;
       }

       if (foundEnd) {
         if (i > lastIndex) {
            tokens.push({ type: 'text', content: text.slice(lastIndex, i) });
         }
         
         tokens.push({ type: 'inline', content: text.slice(i + 1, j) });
         i = j + 1;
         lastIndex = i;
         continue;
       }
    }
    
    i++;
  }
  
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return tokens;
};


export const LatexRenderer: React.FC<Props> = ({ content, className = '', renderMarkdown = false }) => {
  if (!content) return null;

  const parts = splitLatex(content);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.type === 'block' || part.type === 'inline') {
          const displayMode = part.type === 'block';
          // Pre-process LaTeX content for matrix notation if it contains [[
          const processedContent = part.content.includes('[[') ? formatMatrixToLatex(part.content) : part.content;
          
          try {
            const html = katex.renderToString(processedContent, { displayMode, throwOnError: false });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={index}>{displayMode ? `$$${part.content}$$` : `$${part.content}$`}</span>;
          }
        } else {
          if (!part.content) return null;

          if (renderMarkdown) {
              const markedLib = (window as any).marked;
              if (markedLib) {
                  try {
                      const html = markedLib.parseInline(part.content, { breaks: true, gfm: true });
                      return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
                  } catch (e) {
                      return <span key={index}>{part.content}</span>;
                  }
              }
          }
          return <span key={index}>{part.content}</span>;
        }
      })}
    </span>
  );
};