
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
      } else {
        // No closing tag found, continue searching as text
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
            // Condition: Not preceded by space (Latex convention, optional but good for robustness)
            if (/\s/.test(text[j-1])) {
               j++;
               continue;
            }
            foundEnd = true;
            break;
         }
         j++;
       }

       if (foundEnd) {
         // Flush preceding text only when we confirm we found math
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
  
  // Flush remaining text
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
        if (part.type === 'block') {
          try {
            const html = katex.renderToString(part.content, { displayMode: true, throwOnError: false });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={index}>{`$$${part.content}$$`}</span>;
          }
        } else if (part.type === 'inline') {
          try {
            const html = katex.renderToString(part.content, { displayMode: false, throwOnError: false });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={index}>{`$${part.content}$`}</span>;
          }
        } else {
          // Regular Text or Markdown
          if (!part.content) return null;

          if (renderMarkdown) {
              const markedLib = (window as any).marked;
              if (markedLib) {
                  try {
                      // parseInline is important to avoid wrapping in <p> tags for table cells
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
