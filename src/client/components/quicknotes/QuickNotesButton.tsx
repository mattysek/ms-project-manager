// Tlačítko „📝 Poznámky" v hlavičce — viditelné vždy, i bez otevřeného projektu (FR-QN-01).
interface QuickNotesButtonProps {
  open: boolean;
  onToggle: () => void;
}

export function QuickNotesButton({ open, onToggle }: QuickNotesButtonProps) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onToggle}
      style={{
        background: open ? '#0d1f38' : '#161b27',
        borderColor: open ? '#4f9cf944' : '#2d3748',
        color: open ? '#93c5fd' : '#94a3b8',
      }}
      title="Poznámky"
    >
      📝 Poznámky
    </button>
  );
}
