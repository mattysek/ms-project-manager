// Čisté pomocné funkce pro `SouboryView` — typ náhledu, ikony, formátování.
// Žádná z nich nesahá na síť (na rozdíl od `useFilePreview.ts`).
import type { FileRef } from '../../../types';

export type PreviewType = 'image' | 'pdf' | 'markdown' | 'code' | 'text' | 'excel' | 'word';

const IMAGE_MIME_PREFIX = 'image/';
const TEXT_MIME_PREFIX = 'text/';

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const WORD_EXTENSIONS = ['.docx'];
const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];
const CODE_EXTENSIONS = [
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.htm',
  '.xml',
  '.py',
  '.rb',
  '.php',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.sql',
  '.sh',
  '.bash',
  '.yaml',
  '.yml',
  '.toml',
];
const PLAIN_TEXT_EXTENSIONS = ['.txt', '.log', '.csv'];

function hasExtension(name: string, extensions: string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function isExcel(file: FileRef): boolean {
  return (
    hasExtension(file.name, EXCEL_EXTENSIONS) ||
    file.mimeType.includes('spreadsheet') ||
    file.mimeType.includes('excel')
  );
}

function isWord(file: FileRef): boolean {
  return hasExtension(file.name, WORD_EXTENSIONS) || file.mimeType.includes('wordprocessingml');
}

function isMarkdown(file: FileRef): boolean {
  return hasExtension(file.name, MARKDOWN_EXTENSIONS);
}

function isCode(file: FileRef): boolean {
  return hasExtension(file.name, CODE_EXTENSIONS) || file.mimeType === 'application/json';
}

/** Typ náhledu podle MIME/přípony — vždy vrátí něco, `text` je záchytný typ. */
export function getPreviewType(file: FileRef): PreviewType {
  if (file.mimeType.startsWith(IMAGE_MIME_PREFIX)) return 'image';
  if (file.mimeType === 'application/pdf') return 'pdf';
  if (isExcel(file)) return 'excel';
  if (isWord(file)) return 'word';
  if (isMarkdown(file)) return 'markdown';
  if (isCode(file)) return 'code';
  return 'text';
}

/** Jestli má vůbec smysl u souboru nabídnout tlačítko "Zobrazit". */
export function canPreview(file: FileRef): boolean {
  const { mimeType, name } = file;
  if (mimeType.startsWith(IMAGE_MIME_PREFIX) || mimeType.startsWith(TEXT_MIME_PREFIX)) return true;
  if (mimeType === 'application/pdf' || mimeType === 'application/json') return true;
  if (isExcel(file) || isWord(file)) return true;
  return hasExtension(name, [...MARKDOWN_EXTENSIONS, ...CODE_EXTENSIONS, ...PLAIN_TEXT_EXTENSIONS]);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Emoji ikona podle typu souboru — čistě kosmetické. */
export function getFileIcon(mimeType: string, name: string): string {
  if (mimeType.startsWith(IMAGE_MIME_PREFIX)) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType === 'application/pdf') return '📕';
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    hasExtension(name, EXCEL_EXTENSIONS)
  ) {
    return '📗';
  }
  if (
    mimeType.includes('presentation') ||
    mimeType.includes('powerpoint') ||
    hasExtension(name, ['.pptx', '.ppt'])
  ) {
    return '📙';
  }
  if (
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    hasExtension(name, ['.docx', '.doc'])
  ) {
    return '📘';
  }
  if (mimeType === 'application/zip' || mimeType.includes('compressed')) return '📦';
  if (mimeType === 'application/json' || hasExtension(name, ['.json'])) return '📋';
  return '📄';
}
