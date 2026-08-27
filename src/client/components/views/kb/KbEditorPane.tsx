// Editor obsahu KB stránky s přepínáním Editor/Preview (Scenario: Live
// preview markdownu při editaci — knowledge-base.feature). Preview jede přes
// `markdownToHtml` — jediné sanitizované místo pro `dangerouslySetInnerHTML`
// (PRD-07, stored XSS).
import { useMemo } from 'react';
import { markdownToHtml } from '../../../utils/htmlMarkdownConverter';

export type KbEditorTab = 'edit' | 'preview';

interface KbEditorPaneProps {
  content: string;
  onChange: (value: string) => void;
  tab: KbEditorTab;
  onTabChange: (tab: KbEditorTab) => void;
}

const TAB_BASE_STYLE = { padding: '3px 12px', fontSize: 10 } as const;

function tabStyle(active: boolean) {
  return active
    ? { ...TAB_BASE_STYLE, background: '#1a2535', borderColor: '#4f9cf9', color: '#93c5fd' }
    : { ...TAB_BASE_STYLE, background: '#161b27', borderColor: '#2d3748', color: '#64748b' };
}

export function KbEditorPane({ content, onChange, tab, onTabChange }: KbEditorPaneProps) {
  const previewHtml = useMemo(
    () => (tab === 'preview' ? markdownToHtml(content) : ''),
    [tab, content]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '6px 16px',
          borderBottom: '1px solid #1e253366',
        }}
      >
        <button
          type="button"
          className="btn"
          onClick={() => onTabChange('edit')}
          style={tabStyle(tab === 'edit')}
        >
          Editor
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onTabChange('preview')}
          style={tabStyle(tab === 'preview')}
        >
          Preview
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'edit' ? (
          <textarea
            className="inp"
            value={content}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              borderRadius: 0,
              resize: 'none',
              padding: 16,
              fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
              fontSize: 12,
              lineHeight: 1.7,
            }}
            placeholder="Markdown obsah..."
          />
        ) : (
          <div
            className="markdown-content"
            style={{ padding: 20, fontSize: 13, lineHeight: 1.7, color: '#e2e8f0' }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: markdownToHtml je jediné sanitizované místo (CLAUDE.md)
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>
    </div>
  );
}
