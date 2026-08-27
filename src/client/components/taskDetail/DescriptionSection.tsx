// Popis úkolu v Markdownu — pole konceptu s přepínačem náhledu.
//
// Přepínač mění jen zobrazení. Ukládá se s celým dialogem („Uložit změny"),
// stejně jako název nebo MD — viz `useDescriptionEditor`.
import type { DescriptionEditor } from './useDescriptionEditor';

const PLACEHOLDER =
  'Popis úkolu, poznámky, akceptační kritéria...\n\nPodporuje Markdown:\n- **tučné**\n- *kurzíva*\n- [odkaz](https://...)\n- seznamy, kód, atd.';

function SectionHeader({ editor }: { editor: DescriptionEditor }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        background: '#161b27',
        borderBottom: '1px solid #1e2533',
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: '#64748b',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Popis (Markdown)
      </span>
      <button
        type="button"
        onClick={editor.togglePreview}
        className="btn"
        aria-pressed={editor.showPreview}
        style={{
          marginLeft: 'auto',
          padding: '3px 10px',
          fontSize: 9,
          background: '#0d1f38',
          borderColor: '#4f9cf944',
          color: '#4f9cf9',
        }}
      >
        {editor.showPreview ? '✎ Zdroj' : '👁 Náhled'}
      </button>
    </div>
  );
}

export function DescriptionSection({ editor }: { editor: DescriptionEditor }) {
  return (
    <div style={{ border: '1px solid #1e2533', borderRadius: 8, overflow: 'hidden' }}>
      <SectionHeader editor={editor} />
      <div style={{ padding: 12, maxHeight: 220, overflowY: 'auto' }}>
        {editor.showPreview ? (
          <div
            className="markdown-content"
            style={{
              fontSize: 12,
              lineHeight: 1.7,
              color: '#e2e8f0',
              minHeight: 60,
              userSelect: 'text',
            }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: markdownToHtml je jediné sanitizované místo (CLAUDE.md)
            dangerouslySetInnerHTML={{ __html: editor.renderedDesc }}
          />
        ) : (
          <textarea
            value={editor.value}
            onChange={(e) => editor.setValue(e.target.value)}
            placeholder={PLACEHOLDER}
            aria-label="Popis úkolu"
            className="inp"
            style={{
              width: '100%',
              minHeight: 180,
              maxHeight: 350,
              lineHeight: 1.6,
              resize: 'vertical',
              fontSize: 12,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          />
        )}
      </div>
    </div>
  );
}
