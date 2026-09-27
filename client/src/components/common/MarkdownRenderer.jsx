import React, { useMemo } from 'react';
import { marked } from 'marked';

// Configure marked defaults for clean GFM rendering
marked.setOptions({
  gfm: true,
  breaks: true
});

export default function MarkdownRenderer({ content = '', className = '' }) {
  const htmlContent = useMemo(() => {
    if (!content || typeof content !== 'string') return '';
    try {
      let parsed = marked.parse(content);
      // Wrap tables in responsive horizontal-scroll container
      parsed = parsed
        .replace(/<table>/g, '<div class="ai-table-wrapper"><table>')
        .replace(/<\/table>/g, '</table></div>');
      return parsed;
    } catch (e) {
      console.warn('Markdown parse notice:', e);
      return content;
    }
  }, [content]);

  if (!content) return null;

  return (
    <div
      className={`ai-markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
