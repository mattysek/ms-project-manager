// HTML <-> Markdown conversion utilities
// Uses turndown for HTML->Markdown and marked for Markdown->HTML

import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';

// ── HTML to Markdown ──────────────────────────────────────────────────────────

const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

// Remove style, script, and other non-content elements
turndownService.remove(['style', 'script', 'noscript', 'meta', 'link']);

// Keep breaks as-is
turndownService.addRule('br', {
  filter: 'br',
  replacement: () => '\n',
});

// Handle div elements (ADO often wraps content in divs)
turndownService.addRule('div', {
  filter: 'div',
  replacement: (content) => `${content}\n`,
});

// Handle spans (often used for formatting in ADO)
turndownService.addRule('span', {
  filter: 'span',
  replacement: (content) => content,
});

export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === '') return '';

  try {
    // Clean up HTML before conversion
    const cleaned = html
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Normalize line breaks
      .replace(/<br\s*\/?>/gi, '<br>')
      // Remove empty paragraphs
      .replace(/<p>\s*<\/p>/gi, '')
      // Remove empty divs
      .replace(/<div>\s*<\/div>/gi, '');

    const markdown = turndownService.turndown(cleaned);

    // Post-process markdown
    return (
      markdown
        // Remove excessive blank lines
        .replace(/\n{3,}/g, '\n\n')
        // Trim
        .trim()
    );
  } catch (error) {
    console.error('HTML to Markdown conversion failed:', error);
    // Fallback: strip HTML tags
    return html.replace(/<[^>]+>/g, '').trim();
  }
}

// ── Sanitizace HTML (ochrana proti stored XSS) ─────────────────────────────────
//
// V multi-user prostředí se HTML vzniklé z markdownu jednoho uživatele
// (popis úkolu, KB stránka, popis work itemu z ADO, náhled nahraného souboru)
// renderuje přes `dangerouslySetInnerHTML` v prohlížeči ostatních — včetně PM s plnými
// oprávněními. Bez sanitizace jde o stored XSS: vložený `<script>`,
// `onerror="…"` atribut nebo `javascript:` odkaz by se spustil v cizí session.
// Toto je JEDINÉ místo v aplikaci, kterým smí procházet HTML určené pro
// `dangerouslySetInnerHTML` — viz PRD-07, sekce "Bezpečnostní nález".
const SANITIZE_CONFIG: DOMPurifyConfig = {
  // <script>/<style>/<iframe>/… ven úplně, i kdyby byly validní pro DOMPurify jinak.
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base'],
  // DOMPurify sám navíc odstraňuje "on*" event handler atributy a nebezpečná
  // URI schémata (javascript:, data: na <a>/<img> apod.) bez ohledu na ALLOW listy.
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

// ── Markdown to HTML ──────────────────────────────────────────────────────────

export function markdownToHtml(md: string): string {
  if (!md || md.trim() === '') return '';

  try {
    const html = marked(md, { async: false }) as string;
    return sanitizeHtml(html.trim());
  } catch (error) {
    console.error('Markdown to HTML conversion failed:', error);
    // Fallback: wrap in paragraph
    return sanitizeHtml(`<p>${md.replace(/\n/g, '<br>')}</p>`);
  }
}

// ── Description Hash ──────────────────────────────────────────────────────────

export async function computeDescriptionHash(text: string): Promise<string> {
  if (!text) return '';

  // Normalize text for comparison
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // Use SubtleCrypto if available
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(normalized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    } catch {
      // Fall through to simple hash
    }
  }

  // Simple hash fallback
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Synchronous version for compatibility
export function computeDescriptionHashSync(text: string): string {
  if (!text) return '';

  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ── Text Comparison ───────────────────────────────────────────────────────────

export function normalizeForComparison(text: string): string {
  return (
    text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      // Normalize multiple whitespace to single space (but keep newlines)
      .replace(/[^\S\n]+/g, ' ')
      // Remove trailing whitespace from lines
      .replace(/ +\n/g, '\n')
      // Normalize multiple newlines to max 2
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export function areDescriptionsEqual(a: string, b: string): boolean {
  // Compare normalized versions (keeps punctuation, markdown, case)
  return normalizeForComparison(a) === normalizeForComparison(b);
}
