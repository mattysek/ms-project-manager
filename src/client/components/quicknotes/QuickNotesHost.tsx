// Skládá tlačítko + panel dohromady — App.tsx dostane jen dvě props (viz
// FR-QN-01: panel musí být dostupný na LandingPage i uvnitř projektu, takže
// žije mimo `ProjectWorkspace`/`Header`, ne uvnitř nich). Data hook
// (`useQuickNotes`) vlastní volající (`AuthenticatedApp`), protože konverze
// na úkol (FR-QN-07) potřebuje `markConverted` na stejné instanci dat.
import { useEffect, useState } from 'react';
import { listProjects } from '../../api/projectsApi';
import type { UseQuickNotesResult } from '../../hooks/useQuickNotes';
import { QuickNotesButton } from './QuickNotesButton';
import { QuickNotesPanel } from './QuickNotesPanel';
import type { QuickNote } from '../../api/quickNotesApi';

interface QuickNotesHostProps {
  notes: UseQuickNotesResult;
  activeProjectId: string | null;
  onConvert: (note: QuickNote) => void;
  /** Otevřenost vlastní volající — oba panely sdílí jedno místo (`useOpenPanel`). */
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function QuickNotesHost({
  notes,
  activeProjectId,
  onConvert,
  open,
  onToggle,
  onClose,
}: QuickNotesHostProps) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const load = notes.load;
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (open)
      listProjects().then((list) => setProjects(list.map((p) => ({ id: p.id, name: p.name }))));
  }, [open]);

  return (
    <>
      <QuickNotesButton open={open} onToggle={onToggle} />
      {open && (
        <QuickNotesPanel
          notes={notes}
          projects={projects}
          canConvert={!!activeProjectId}
          onConvert={onConvert}
          onClose={onClose}
        />
      )}
    </>
  );
}
