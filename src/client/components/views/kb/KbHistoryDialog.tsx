// Historie verzí KB stránky (knowledge-base.feature).
//
// Bez historie byla znalostní báze místo, kam se člověk bojí psát: mazat směl
// kdokoli, konfliktní dialog nabízel „přepsat serverovou verzi" a obojí bylo
// nevratné. Revize ukládá server před každou změnou i před smazáním.
//
// Obnovení **není** vlastní endpoint — vezme se obsah revize a pošle běžnou
// cestou jako editace stránky. Projde tak stejnou autorizací, diffy i offline
// frontou a samo se stane další položkou historie.
import { useEffect, useState } from 'react';
import { listRevisions, type KbRevision } from '../../../api/kbApi';
import { formatDate } from './formatDate';
import { LAYERS } from '../../../constants/layers';

interface KbHistoryDialogProps {
  projectId: string;
  pageId: string;
  onRestore: (revision: KbRevision) => void;
  onClose: () => void;
}

function RevisionRow({
  revision,
  onRestore,
}: {
  revision: KbRevision;
  onRestore: (revision: KbRevision) => void;
}) {
  return (
    <div
      style={{
        padding: '8px 10px',
        borderBottom: '1px solid #1e253366',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#e2e8f0' }}>{revision.title}</div>
        <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
          {formatDate(revision.savedAt)} — {revision.savedBy}
        </div>
        <div
          style={{
            fontSize: 9,
            color: '#475569',
            marginTop: 4,
            maxHeight: 34,
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
          }}
        >
          {revision.content.slice(0, 200)}
        </div>
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => {
          if (confirm('Obnovit tuto verzi? Současný obsah se uloží do historie.')) {
            onRestore(revision);
          }
        }}
        style={{ padding: '3px 10px', fontSize: 10, flexShrink: 0 }}
      >
        Obnovit
      </button>
    </div>
  );
}

export function KbHistoryDialog({ projectId, pageId, onRestore, onClose }: KbHistoryDialogProps) {
  const [revisions, setRevisions] = useState<KbRevision[] | null>(null);

  useEffect(() => {
    let active = true;
    listRevisions(projectId, pageId)
      .then((loaded) => active && setRevisions(loaded))
      .catch(() => active && setRevisions([]));
    return () => {
      active = false;
    };
  }, [projectId, pageId]);

  return (
    // Overlay zavírá kliknutím mimo obsah — stejný vzor a stejné zdůvodnění
    // jako `DeleteConfirmDialog`.
    // biome-ignore lint/a11y/useKeyWithClickEvents: overlay pro zavření kliknutím mimo
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay pro zavření kliknutím mimo
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: LAYERS.modal,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Historie stránky"
        style={{
          width: 520,
          maxHeight: '70vh',
          background: '#0f1117',
          border: '1px solid #2d3748',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #1e2533',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Historie stránky</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít historii"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>

        <HistoryBody revisions={revisions} onRestore={onRestore} />
      </div>
    </div>
  );
}

/** Tři stavy (načítání / prázdno / seznam) mimo hlavní komponentu — ADR-012. */
function HistoryBody({
  revisions,
  onRestore,
}: {
  revisions: KbRevision[] | null;
  onRestore: (revision: KbRevision) => void;
}) {
  if (revisions === null) {
    return <div style={{ padding: 20, color: '#475569', fontSize: 11 }}>Načítám…</div>;
  }
  if (revisions.length === 0) {
    return (
      <div style={{ padding: 20, color: '#475569', fontSize: 11 }}>
        Stránka zatím nemá žádnou dřívější verzi.
      </div>
    );
  }
  return (
    <div style={{ overflowY: 'auto' }}>
      {revisions.map((revision) => (
        <RevisionRow key={revision.id} revision={revision} onRestore={onRestore} />
      ))}
    </div>
  );
}
