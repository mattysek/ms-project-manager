// Sdílené inline styly pro ADO Sync (PRD-06) — používá je většina podkomponent
// v tomto adresáři, proto jsou vytažené do jednoho souboru místo duplikace.
import type { CSSProperties } from 'react';

export const PANEL: CSSProperties = {
  border: '1px solid #1e2533',
  borderRadius: 10,
  overflow: 'hidden',
};
export const PANEL_HEAD: CSSProperties = {
  background: '#161b27',
  padding: '10px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
};
export const SECTION_TITLE: CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 700,
  marginBottom: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
export const EMPTY_BOX: CSSProperties = {
  ...PANEL,
  padding: 20,
  textAlign: 'center',
  color: '#475569',
  fontSize: 11,
};
export const LABEL: CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  display: 'block',
  marginBottom: 4,
};
export const SUB_PANEL: CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: '#0f1117',
  borderRadius: 8,
  border: '1px solid #1e2533',
};
export const GRID2: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
export const BTN_BLUE: CSSProperties = {
  background: '#0c1a2a',
  border: '1px solid #4f9cf944',
  color: '#93c5fd',
  padding: '4px 10px',
  fontSize: 10,
};
export const BTN_GREEN: CSSProperties = {
  background: '#0d2210',
  border: '1px solid #34d39966',
  color: '#6ee7b7',
  padding: '4px 10px',
  fontSize: 10,
};
export const BTN_GHOST: CSSProperties = {
  background: 'transparent',
  border: '1px solid #2d3748',
  color: '#64748b',
  padding: '4px 10px',
  fontSize: 10,
};
