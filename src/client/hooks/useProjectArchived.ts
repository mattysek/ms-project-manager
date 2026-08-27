// Je otevřený projekt archivovaný?
//
// Archiv byl doteď jen filtr v seznamu na LandingPage: projekt z něj šlo
// otevřít a plně editovat, protože `ArchivedAt` nikdo nekontroloval. Server to
// teď odmítá (`ProjectHub`, `FilesApi`), ale bez tohohle příznaku by to
// uživatel poznal až podle toho, že se mu změna vrátila zpátky.
//
// Stav archivace nese `GET /api/projects` (`ProjectSummary.archivedAt`) —
// vlastní endpoint pro jeden projekt nevznikl schválně, protože seznam je
// v týmu do 15 lidí krátký a stejné volání už dělá LandingPage.
import { useEffect, useState } from 'react';
import { isArchived, listProjects } from '../api/projectsApi';

export function useProjectArchived(projectId: string | null): boolean {
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    setArchived(false);
    if (!projectId) return;
    let cancelled = false;
    listProjects()
      .then((projects) => {
        if (cancelled) return;
        const open = projects.find((project) => project.id === projectId);
        setArchived(!!open && isArchived(open));
      })
      .catch(() => {
        // Selhání znamená „nevíme" — a to se musí chovat jako „needitovatelné
        // není". Autoritativní je stejně server, který zápis odmítne sám.
        if (!cancelled) setArchived(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return archived;
}
