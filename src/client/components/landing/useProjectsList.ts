// Stav a REST volání pro LandingPage — vytaženo z komponenty, aby `LandingPage`
// zůstal pod rozpočtem ADR-012 (délka funkce) a aby `useEffect` závislosti
// odpovídaly skutečně použitým hodnotám (`loadProjects` jako stabilní `useCallback`).
import { useCallback, useEffect, useState } from 'react';
import {
  archiveProject,
  createProject,
  deleteProject,
  isArchived,
  listProjects,
  ProjectsApiError,
  unarchiveProject,
} from '../../api/projectsApi';
import type { ProjectSummary } from '../../api/projectsApi';

function errorMessage(err: unknown): string {
  return err instanceof ProjectsApiError ? err.message : 'Neznámá chyba';
}

export interface UseProjectsListResult {
  /** Aktivní projekty — archiv se zobrazuje zvlášť. */
  projects: ProjectSummary[];
  archived: ProjectSummary[];
  loading: boolean;
  /** Hláška o neúspěšné operaci; `null` = nic se nepokazilo. */
  error: string | null;
  dismissError: () => void;
  createAndOpen: (name: string) => Promise<string | null>;
  archive: (id: string) => Promise<void>;
  unarchive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useProjectsList(): UseProjectsListResult {
  const [all, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await listProjects());
    } catch (err) {
      console.error('Nepodařilo se načíst seznam projektů:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Přidání do projektu nemá žádný signál — členství je REST zdroj pravdy a
  // uživatel, který zrovna kouká na seznam, se o novém projektu nedozví (na
  // rozdíl od změny role, která chodí jako `role_changed`). Návrat do okna je
  // nejbližší okamžik, kdy o něm mohl slyšet jinde: „přidal jsem tě, mrkni".
  useEffect(() => {
    window.addEventListener('focus', loadProjects);
    return () => window.removeEventListener('focus', loadProjects);
  }, [loadProjects]);

  const createAndOpen = useCallback(async (name: string): Promise<string | null> => {
    try {
      const project = await createProject(name);
      return project.id;
    } catch (err) {
      setError(`Nepodařilo se vytvořit projekt: ${errorMessage(err)}`);
      return null;
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteProject(id);
        await loadProjects();
      } catch (err) {
        setError(`Nepodařilo se smazat projekt: ${errorMessage(err)}`);
      }
    },
    [loadProjects]
  );

  const archive = useCallback(
    async (id: string) => {
      try {
        await archiveProject(id);
        await loadProjects();
      } catch (err) {
        setError(`Nepodařilo se archivovat projekt: ${errorMessage(err)}`);
      }
    },
    [loadProjects]
  );

  const unarchive = useCallback(
    async (id: string) => {
      try {
        await unarchiveProject(id);
        await loadProjects();
      } catch (err) {
        setError(`Nepodařilo se vrátit projekt z archivu: ${errorMessage(err)}`);
      }
    },
    [loadProjects]
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    error,
    dismissError,
    projects: all.filter((project) => !isArchived(project)),
    archived: all.filter(isArchived),
    loading,
    createAndOpen,
    archive,
    unarchive,
    remove,
  };
}
