// Tlačítko „📝 Poznámky" v hlavičce — viditelné vždy, i bez otevřeného projektu (FR-QN-01).
import { PanelToggleButton } from '../PanelToggleButton';

interface QuickNotesButtonProps {
  open: boolean;
  onToggle: () => void;
}

export function QuickNotesButton({ open, onToggle }: QuickNotesButtonProps) {
  return (
    <PanelToggleButton
      active={open}
      icon="📝"
      label="Poznámky"
      title="Poznámky"
      onClick={onToggle}
    />
  );
}
