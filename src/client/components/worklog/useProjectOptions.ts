// Projekty pro výběr u záznamu a pro pojmenování v seznamu a grafech.
//
// Vazba na projekt je jen štítek (ADR-017), takže se nabízejí i archivované:
// práce na archivovaném projektu se pořád mohla stát a jeho starší záznamy
// musí zůstat pojmenované, ne se schovat pod holé id.
import { useEffect, useMemo, useState } from 'react';
import { listProjects } from '../../api/projectsApi';
import type { ProjectOption } from './EntryForm';

export function useProjectOptions() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    let alive = true;
    void listProjects()
      .then((loaded) => {
        if (alive) setProjects(loaded.map(({ id, name }) => ({ id, name })));
      })
      .catch(() => {
        // Bez seznamu se dá vykazovat dál, jen bez štítku projektu.
      });
    return () => {
      alive = false;
    };
  }, []);

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );

  return { projects, projectNames };
}
