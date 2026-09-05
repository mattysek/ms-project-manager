// Tlačítko + panel výkazů dohromady — obdoba `VaultHost` a `QuickNotesHost`.
//
// Běžící stopky vlastní tenhle komponent (`useWorkTimer`), protože je nikdo
// jiný v liště nepotřebuje. „Je panel otevřený" naopak vlastní volající
// (`useOpenPanel`) — o tom musí rozhodovat jedno místo pro všechny tři panely,
// jinak se překrývají.
import { useWorkTimer } from '../../hooks/useWorkTimer';
import { useProjectOptions } from './useProjectOptions';
import { useWorkLogTags } from './useWorkLogTags';
import { WorkLogButton } from './WorkLogButton';
import { WorkLogPanel } from './WorkLogPanel';

interface WorkLogHostProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenFull: () => void;
}

export function WorkLogHost({ open, onToggle, onClose, onOpenFull }: WorkLogHostProps) {
  const timer = useWorkTimer();
  const { projects } = useProjectOptions();
  const knownTags = useWorkLogTags();

  return (
    <>
      <WorkLogButton open={open} running={timer.running} now={timer.now} onToggle={onToggle} />
      {open && (
        <WorkLogPanel
          timer={timer}
          projects={projects}
          knownTags={knownTags}
          onClose={onClose}
          onOpenFull={onOpenFull}
        />
      )}
    </>
  );
}
