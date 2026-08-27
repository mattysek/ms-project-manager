// Pruh nad archivovaným projektem.
//
// Archiv je zamrzlý stav před smazáním, ne jen jiná sekce v seznamu. Otevřít
// a číst ho jde dál — kvůli tomu se archivuje místo mazání — ale zápis server
// odmítá. Bez tohohle pruhu vypadal archivovaný projekt úplně stejně jako
// aktivní a uživatel na to přišel, až když se mu první změna vrátila zpátky.
interface ArchivedBannerProps {
  archived: boolean;
}

export function ArchivedBanner({ archived }: ArchivedBannerProps) {
  if (!archived) return null;

  return (
    <div
      role="status"
      style={{
        background: '#241a08',
        borderBottom: '1px solid #f59e0b55',
        color: '#fcd34d',
        fontSize: 11,
        padding: '8px 28px',
      }}
    >
      🗄 Projekt je archivovaný — jen ke čtení. Úpravy budou možné po vrácení z archivu
      (Projekty → Archiv → ⤺).
    </div>
  );
}
