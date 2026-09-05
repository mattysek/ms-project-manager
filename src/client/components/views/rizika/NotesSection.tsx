// Sekce „Poznámky k projektu" — obecné poznámky, odkazy (Scenario: Editace
// poznámek k projektu).
//
// Text je Markdown, stejně jako popis úkolu a stránky KB — do poznámek se
// stejně píšou odkazy a odrážky, takže je nemá smysl držet jako holý text.
// Přepínač zdroj ⇄ náhled je tentýž vzor jako v detailu úkolu
// (`DescriptionSection`): mění jen zobrazení, nic neukládá.
import { useEffect, useMemo, useState } from 'react';
import type { ChangelogEntry, Project } from '../../../types';
import type { MemberRole } from '../../../types/protocol';
import { markdownToHtml } from '../../../utils/htmlMarkdownConverter';
import { PermissionGate } from '../../PermissionGate';

const EMPTY_NOTES = '<p style="color:#475569;font-style:italic">Zatím žádné poznámky</p>';

interface NotesSectionProps {
  notes: string;
  updateProject: (field: keyof Project, val: string | number | ChangelogEntry[]) => void;
  role: MemberRole | null;
}

function NotesHeader({ showPreview, onToggle }: { showPreview: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        background: '#161b27',
        padding: '10px 16px',
        borderBottom: '1px solid #1e2533',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: '#64748b',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Poznámky k projektu (Markdown)
      </div>
      <button
        type="button"
        className="btn"
        onClick={onToggle}
        aria-pressed={showPreview}
        style={{
          marginLeft: 'auto',
          padding: '3px 10px',
          fontSize: 9,
          background: '#0d1f38',
          borderColor: '#4f9cf944',
          color: '#4f9cf9',
        }}
      >
        {showPreview ? '✎ Zdroj' : '👁 Náhled'}
      </button>
    </div>
  );
}

export function NotesSection({ notes, updateProject, role }: NotesSectionProps) {
  // Lokální draft, commit až na blur (ADR-004 „commandy při commitu, ne za
  // klávesu") — Scenario: Editace poznámek k projektu.
  const [draft, setDraft] = useState(notes);
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => setDraft(notes), [notes]);
  const commit = () => {
    if (draft !== notes) updateProject('notes', draft);
  };

  // Sanitizováno v `markdownToHtml` — poznámky mohl napsat jiný uživatel.
  const rendered = useMemo(() => (notes ? markdownToHtml(notes) : EMPTY_NOTES), [notes]);

  return (
    <div
      style={{ border: '1px solid #1e2533', borderRadius: 10, overflow: 'hidden', height: '100%' }}
    >
      <NotesHeader
        showPreview={showPreview}
        onToggle={() => {
          // Přepnutí do náhledu je zároveň opuštění pole — bez commitu by se
          // náhled vykreslil z ještě neuloženého textu, tedy ze starého.
          if (!showPreview) commit();
          setShowPreview((value) => !value);
        }}
      />
      <div style={{ padding: '12px 16px' }}>
        {showPreview ? (
          <div
            className="markdown-content"
            style={{ fontSize: 11, lineHeight: 1.7, color: '#e2e8f0', minHeight: 240 }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: markdownToHtml je jediné sanitizované místo (CLAUDE.md)
            dangerouslySetInnerHTML={{ __html: rendered }}
          />
        ) : (
          <PermissionGate role={role} require="pm" readOnly>
            <textarea
              className="inp"
              aria-label="Poznámky k projektu"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              placeholder="Zde můžete psát poznámky k projektu, odkazy na dokumenty...&#10;Podporuje Markdown."
              style={{
                width: '100%',
                minHeight: 240,
                resize: 'vertical',
                lineHeight: 1.6,
                fontSize: 11,
              }}
            />
          </PermissionGate>
        )}
      </div>
    </div>
  );
}
