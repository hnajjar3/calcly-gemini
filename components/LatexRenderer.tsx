import React from 'react';

declare const katex: any;

interface Props {
  content: string;
  className?: string;
}

export const LatexRenderer: React.FC<Props> = ({ content, className = '' }) => {
  // Split content by $$...$$ for block math and $...$ for inline math
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          // Block Math
          const math = part.slice(2, -2);
          try {
            const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={index}>{part}</span>;
          }
        } else if (part.startsWith('$') && part.endsWith('$')) {
          // Inline Math
          const math = part.slice(1, -1);
          try {
            const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={index}>{part}</span>;
          }
        } else {
          // Regular Text
          return <span key={index}>{part}</span>;
        }
      })}
    </span>
  );
};