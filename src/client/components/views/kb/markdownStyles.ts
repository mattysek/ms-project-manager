/** CSS pro `.markdown-content` (náhled i uložené stránky) — beze změny z původního KnowledgeBaseView. */
export const MARKDOWN_STYLES = `
        .markdown-content h1 { font-size: 1.8em; font-weight: 700; margin: 0 0 16px 0; color: #f1f5f9; border-bottom: 1px solid #2d3748; padding-bottom: 8px; }
        .markdown-content h2 { font-size: 1.4em; font-weight: 600; margin: 24px 0 12px 0; color: #e2e8f0; }
        .markdown-content h3 { font-size: 1.2em; font-weight: 600; margin: 20px 0 10px 0; color: #cbd5e1; }
        .markdown-content h4 { font-size: 1em; font-weight: 600; margin: 16px 0 8px 0; color: #94a3b8; }
        .markdown-content p { margin: 0 0 12px 0; }
        .markdown-content ul, .markdown-content ol { margin: 0 0 12px 0; padding-left: 24px; }
        .markdown-content li { margin-bottom: 4px; }
        .markdown-content code {
          background: #1e293b;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'IBM Plex Mono', 'Courier New', monospace;
          font-size: 0.9em;
          color: #fbbf24;
        }
        .markdown-content pre {
          background: #0c1018;
          border: 1px solid #1e2533;
          border-radius: 8px;
          padding: 14px 16px;
          margin: 12px 0;
          overflow-x: auto;
        }
        .markdown-content pre code {
          background: transparent;
          padding: 0;
          color: #e2e8f0;
        }
        .markdown-content a {
          color: #4f9cf9;
          text-decoration: none;
        }
        .markdown-content a:hover {
          text-decoration: underline;
        }
        .markdown-content blockquote {
          border-left: 3px solid #4f9cf9;
          margin: 12px 0;
          padding: 8px 16px;
          background: #0f172a;
          color: #94a3b8;
        }
        .markdown-content table {
          border-collapse: collapse;
          margin: 12px 0;
          width: 100%;
        }
        .markdown-content th, .markdown-content td {
          border: 1px solid #2d3748;
          padding: 8px 12px;
          text-align: left;
        }
        .markdown-content th {
          background: #161b27;
          font-weight: 600;
        }
        .markdown-content hr {
          border: none;
          border-top: 1px solid #2d3748;
          margin: 20px 0;
        }
        .markdown-content img {
          max-width: 100%;
          border-radius: 8px;
        }
      `;
