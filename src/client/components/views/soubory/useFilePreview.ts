// Náhled souboru (files.feature: obrázek/PDF/Excel/Word/text). Obrázek a PDF
// se renderují přímo z `inlinePreviewUrl` (cookie auth funguje i mimo
// `fetch`), ostatní typy potřebují stažený obsah — Excel/Word parsing zůstává
// na klientovi (ADR-010), jen si napřed stáhne blob přes `filesApi`.
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { markdownToHtml, sanitizeHtml } from '../../../utils/htmlMarkdownConverter';
import { fetchFileArrayBuffer, fetchFileText } from '../../../api/filesApi';
import { getPreviewType } from './fileHelpers';
import type { FileRef } from '../../../types';

export interface ExcelPreview {
  sheets: string[];
  data: Record<string, unknown[][]>;
}

export interface UseFilePreviewResult {
  previewFile: FileRef | null;
  openPreview: (file: FileRef) => void;
  closePreview: () => void;
  textContent: string;
  markdownHtml: string;
  wordHtml: string;
  excelData: ExcelPreview | null;
  activeSheet: string;
  setActiveSheet: (sheet: string) => void;
}

function parseExcel(buffer: ArrayBuffer): ExcelPreview {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const data: Record<string, unknown[][]> = {};
  for (const sheetName of workbook.SheetNames) {
    data[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
    }) as unknown[][];
  }
  return { sheets: workbook.SheetNames, data };
}

async function loadWordPreview(fileId: string, setWordHtml: (v: string) => void): Promise<void> {
  try {
    const buffer = await fetchFileArrayBuffer(fileId);
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    setWordHtml(sanitizeHtml(result.value));
  } catch (err) {
    console.error('Word conversion error:', err);
    setWordHtml('<p style="color: #f87171;">Nepodařilo se načíst Word dokument.</p>');
  }
}

async function loadExcelPreview(
  fileId: string,
  setExcelData: (v: ExcelPreview | null) => void,
  setActiveSheet: (v: string) => void
): Promise<void> {
  try {
    const parsed = parseExcel(await fetchFileArrayBuffer(fileId));
    setExcelData(parsed);
    setActiveSheet(parsed.sheets[0] || '');
  } catch (err) {
    console.error('Excel parsing error:', err);
    setExcelData(null);
  }
}

async function loadTextPreview(fileId: string, setTextContent: (v: string) => void): Promise<void> {
  try {
    setTextContent(await fetchFileText(fileId));
  } catch (err) {
    console.error('Text preview error:', err);
  }
}

/** Načte obsah náhledu podle typu — vytaženo z efektu, ať zůstane pod ADR-012 limitem složitosti. */
function loadPreviewContent(
  file: FileRef,
  setters: {
    setTextContent: (v: string) => void;
    setWordHtml: (v: string) => void;
    setExcelData: (v: ExcelPreview | null) => void;
    setActiveSheet: (v: string) => void;
  }
): void {
  const type = getPreviewType(file);
  if (type === 'word') void loadWordPreview(file.id, setters.setWordHtml);
  else if (type === 'excel')
    void loadExcelPreview(file.id, setters.setExcelData, setters.setActiveSheet);
  else if (type === 'markdown' || type === 'code' || type === 'text') {
    void loadTextPreview(file.id, setters.setTextContent);
  }
}

export function useFilePreview(): UseFilePreviewResult {
  const [previewFile, setPreviewFile] = useState<FileRef | null>(null);
  const [textContent, setTextContent] = useState('');
  const [wordHtml, setWordHtml] = useState('');
  const [excelData, setExcelData] = useState<ExcelPreview | null>(null);
  const [activeSheet, setActiveSheet] = useState('');

  useEffect(() => {
    setTextContent('');
    setWordHtml('');
    setExcelData(null);
    setActiveSheet('');
    if (!previewFile) return;
    loadPreviewContent(previewFile, { setTextContent, setWordHtml, setExcelData, setActiveSheet });
  }, [previewFile]);

  const markdownHtml =
    previewFile && getPreviewType(previewFile) === 'markdown' ? markdownToHtml(textContent) : '';

  return {
    previewFile,
    openPreview: setPreviewFile,
    closePreview: () => setPreviewFile(null),
    textContent,
    markdownHtml,
    wordHtml,
    excelData,
    activeSheet,
    setActiveSheet,
  };
}
