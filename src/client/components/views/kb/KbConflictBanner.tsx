// Notifikace o souběžné editaci stejné KB stránky (Scenario: Simultánní
// editace stejné KB stránky — knowledge-base.feature). Na rozdíl od obecné
// FR-COLLAB-07 notifikace (jedno pole, jen dismiss) KB editor drží rozsáhlý
// lokální draft (celý markdown obsah) — tichá ztráta rozepsané práce by byla
// horší než u jednoho pole, proto uživatel dostane explicitní volbu.
interface KbConflictBannerProps {
  onRestore: () => void;
  onKeepMine: () => void;
}

export function KbConflictBanner({ onRestore, onKeepMine }: KbConflictBannerProps) {
  return (
    <div
      role="alert"
      style={{
        background: '#2a2010',
        border: '1px solid #f59e0b66',
        borderRadius: 8,
        padding: '10px 14px',
        margin: '10px 16px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 11,
        color: '#fcd34d',
      }}
    >
      <span style={{ flex: 1 }}>
        Tato stránka byla upravena jiným uživatelem. Chcete obnovit obsah?
      </span>
      <button
        type="button"
        className="btn"
        onClick={onRestore}
        style={{
          padding: '3px 10px',
          fontSize: 10,
          background: '#161b27',
          borderColor: '#2d3748',
          color: '#94a3b8',
        }}
      >
        Obnovit
      </button>
      <button
        type="button"
        className="btn"
        onClick={onKeepMine}
        style={{
          padding: '3px 10px',
          fontSize: 10,
          background: '#0d2210',
          borderColor: '#34d39966',
          color: '#6ee7b7',
        }}
      >
        Zachovat mé změny
      </button>
    </div>
  );
}
