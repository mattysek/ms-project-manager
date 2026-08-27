// Detail work itemu.
import { useMemo } from 'react';
import type { ADOConfig, ADOWorkItemView } from '../../../types';
import { markdownToHtml } from '../../../utils/htmlMarkdownConverter';
import { buildWiUrl } from '../../../utils/adoLinks';
import { BTN_BLUE, BTN_GHOST, SUB_PANEL } from './styles';

export function AdoDetailPanel({
  wi,
  config,
  onClose,
}: {
  wi?: ADOWorkItemView;
  config: ADOConfig | null;
  onClose: () => void;
}) {
  // markdownToHtml sanitizuje — popis pochází z ADO (cizí server, stored XSS).
  const html = useMemo(() => markdownToHtml(wi?.descriptionMd || ''), [wi]);

  if (!wi) {
    return (
      <div style={SUB_PANEL}>
        <div style={{ fontSize: 11, color: '#fca5a5' }}>
          Work item není ve výsledku posledního syncu. Spusťte synchronizaci znovu.
        </div>
      </div>
    );
  }

  return (
    <div style={SUB_PANEL}>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b' }}>Work Item #{wi.id}</span>
        <span style={{ color: '#e2e8f0' }}>{wi.workItemType}</span>
        <span style={{ color: '#e2e8f0' }}>Stav: {wi.state}</span>
        <span style={{ color: '#e2e8f0' }}>Přiřazen: {wi.assignedTo || '—'}</span>
      </div>
      <div
        className="markdown-preview"
        style={{
          background: '#0c1018',
          padding: 12,
          borderRadius: 6,
          fontSize: 11,
          color: '#e2e8f0',
          maxHeight: 200,
          overflow: 'auto',
        }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: html je z markdownToHtml — jediné sanitizované místo (CLAUDE.md); popis WI z ADO prochází stejnou sanitizací jako místní markdown
        dangerouslySetInnerHTML={{
          __html: wi.descriptionMd.trim() ? html : '<p>Žádný popis v ADO</p>',
        }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        {config && (
          <a
            className="btn"
            href={buildWiUrl(config, wi.id)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...BTN_BLUE, textDecoration: 'none', borderRadius: 6 }}
          >
            ↗ Otevřít v ADO
          </a>
        )}
        <button type="button" className="btn" onClick={onClose} style={BTN_GHOST}>
          Zavřít
        </button>
      </div>
    </div>
  );
}
