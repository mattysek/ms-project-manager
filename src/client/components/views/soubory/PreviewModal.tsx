// Modál s náhledem souboru — obsah podle typu (files.feature: obrázek, PDF,
// Excel, Word, markdown, kód/text). Obrázek a PDF jdou přímo na `inlinePreviewUrl`
// (cookie auth funguje i v `<img>`/`<iframe>`, žádný `fetch` navíc netřeba).
import { inlinePreviewUrl } from '../../../api/filesApi';
import { formatSize, getFileIcon, getPreviewType } from './fileHelpers';
import type { UseFilePreviewResult } from './useFilePreview';
import type { FileRef } from '../../../types';
import { LAYERS } from '../../../constants/layers';

interface PreviewModalProps {
  preview: UseFilePreviewResult;
  onDownload: (file: FileRef) => void;
}

const MARKDOWN_PREVIEW_STYLE = {
  padding: '24px 32px',
  color: '#e2e8f0',
  lineHeight: 1.7,
  fontSize: 13,
  userSelect: 'text',
  cursor: 'text',
} as const;

function ImagePreview({ file }: { file: FileRef }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100%',
        padding: 20,
      }}
    >
      <img
        src={inlinePreviewUrl(file.id)}
        alt={file.name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }}
      />
    </div>
  );
}

function PdfPreview({ file }: { file: FileRef }) {
  return (
    <iframe
      src={inlinePreviewUrl(file.id)}
      style={{ width: '100%', height: '100%', border: 'none', borderRadius: 10 }}
      title={file.name}
    />
  );
}

function MarkdownPreview({ html }: { html: string }) {
  return (
    <div
      className="markdown-preview"
      style={MARKDOWN_PREVIEW_STYLE}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: markdownHtml je z markdownToHtml — jediné sanitizované místo (CLAUDE.md)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function WordPreview({ html }: { html: string }) {
  return (
    <div
      className="markdown-preview"
      style={MARKDOWN_PREVIEW_STYLE}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: wordHtml prochází sanitizeHtml po převodu z mammoth (viz useFilePreview.ts)
      dangerouslySetInnerHTML={{ __html: html || '<p style="color: #64748b;">Načítání...</p>' }}
    />
  );
}

function TextPreview({ text, isCode }: { text: string; isCode: boolean }) {
  return (
    <pre
      style={{
        padding: '20px 24px',
        margin: 0,
        color: isCode ? '#a5f3fc' : '#e2e8f0',
        fontSize: 12,
        lineHeight: 1.6,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        userSelect: 'text',
        cursor: 'text',
      }}
    >
      {text}
    </pre>
  );
}

function PreviewBody({ preview, file }: { preview: UseFilePreviewResult; file: FileRef }) {
  const type = getPreviewType(file);

  switch (type) {
    case 'image':
      return <ImagePreview file={file} />;
    case 'pdf':
      return <PdfPreview file={file} />;
    case 'markdown':
      return <MarkdownPreview html={preview.markdownHtml} />;
    case 'word':
      return <WordPreview html={preview.wordHtml} />;
    case 'excel':
      return <ExcelPreviewTable preview={preview} />;
    default:
      return <TextPreview text={preview.textContent} isCode={type === 'code'} />;
  }
}

function ExcelPreviewTable({ preview }: { preview: UseFilePreviewResult }) {
  const { excelData, activeSheet, setActiveSheet } = preview;
  if (!excelData) return null;
  const rows = excelData.data[activeSheet] || [];

  return (
    <div style={{ padding: 16 }}>
      {excelData.sheets.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {excelData.sheets.map((sheet) => (
            <button
              type="button"
              key={sheet}
              onClick={() => setActiveSheet(sheet)}
              style={{
                padding: '4px 12px',
                fontSize: 10,
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: activeSheet === sheet ? '#0d2210' : 'transparent',
                border: `1px solid ${activeSheet === sheet ? '#34d399' : '#2d3748'}`,
                color: activeSheet === sheet ? '#6ee7b7' : '#64748b',
              }}
            >
              {sheet}
            </button>
          ))}
        </div>
      )}
      <div style={{ overflow: 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: 11,
            minWidth: '100%',
            userSelect: 'text',
            cursor: 'text',
          }}
        >
          <tbody>
            {/*
              Buňky Excel listu nemají vlastní id — pozice řádku/sloupce je jejich
              identita a data se v rámci náhledu nepřeuspořádávají ani nemažou,
              proto je index bezpečný jako key.
            */}
            {rows.map((row, rowIdx) => (
              <tr
                // biome-ignore lint/suspicious/noArrayIndexKey: viz komentář výše tabulky
                key={rowIdx}
              >
                {(row as unknown[]).map((cell, cellIdx) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: viz komentář výše tabulky
                    key={cellIdx}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #1e2533',
                      background: rowIdx === 0 ? '#161b27' : '#0c1018',
                      color: rowIdx === 0 ? '#f1f5f9' : '#e2e8f0',
                      fontWeight: rowIdx === 0 ? 600 : 400,
                      whiteSpace: 'nowrap',
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={String(cell ?? '')}
                  >
                    {String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 11, padding: 20, textAlign: 'center' }}>
          Prázdný list
        </div>
      )}
    </div>
  );
}

export function PreviewModal({ preview, onDownload }: PreviewModalProps) {
  const file = preview.previewFile;
  if (!file) return null;

  // Kliknutí na pozadí je zkratka k zavření; klávesnicí se náhled zavře
  // tlačítkem „✕ Zavřít", které je v pořadí tabulátoru.
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pozadí modalu, ne ovládací prvek
    // biome-ignore lint/a11y/useKeyWithClickEvents: zavření klávesnicí řeší tlačítko „✕ Zavřít"
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: LAYERS.modal,
        display: 'flex',
        flexDirection: 'column',
        padding: 20,
      }}
      onClick={preview.closePreview}
    >
      {/* Jen zastavení bublání, aby klik uvnitř náhledu nezavřel modal —
          žádná vlastní interakce, tedy ani klávesová obsluha. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation, ne interakce */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation, ne interakce */}
      <div
        // Ovládání náhledu je vlastní oblast, ne jen řádek s tlačítky —
        // pojmenování ji odděluje od stejně nazvaných tlačítek v seznamu
        // souborů pod ním (obojí má „↓ Stáhnout").
        // `toolbar`, ne `group`: je to sada ovládacích prvků, a `group` má
        // v HTML protějšek `<fieldset>`, který sem nepatří (Biome to hlídá).
        role="toolbar"
        aria-label="Náhled přílohy"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>{getFileIcon(file.mimeType, file.name)}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{file.name}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              {formatSize(file.size)} · {file.mimeType}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => onDownload(file)}
            style={{
              background: '#0c1a2a',
              borderColor: '#4f9cf944',
              color: '#93c5fd',
              padding: '6px 14px',
              fontSize: 11,
            }}
          >
            ↓ Stáhnout
          </button>
          <button
            type="button"
            className="btn"
            onClick={preview.closePreview}
            style={{
              background: '#2a1010',
              borderColor: '#f8717144',
              color: '#f87171',
              padding: '6px 14px',
              fontSize: 11,
            }}
          >
            ✕ Zavřít
          </button>
        </div>
      </div>

      {/* Jen zastavení bublání, aby klik uvnitř náhledu nezavřel modal —
          žádná vlastní interakce, tedy ani klávesová obsluha. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation, ne interakce */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation, ne interakce */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#0f1117',
          borderRadius: 10,
          border: '1px solid #1e2533',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <PreviewBody preview={preview} file={file} />
      </div>
    </div>
  );
}
