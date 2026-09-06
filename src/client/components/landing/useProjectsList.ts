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
import {
  getProjectListCache,
  listCachedProjects,
  saveProjectListCache,
} from '../../storage/projectCache';

function errorMessage(err: unknown): string {
  return err instanceof ProjectsApiError ? err.message : 'Neznámá chyba';
}

export interface UseProjectsListResult {
  /** Aktivní projekty — archiv se zobrazuje zvlášť. */
  projects: ProjectSummary[];
  archived: ProjectSummary[];
  loading: boolean;
  /**
   * Seznam se nepodařilo načíst a pochází z cache (nebo není vůbec).
   *
   * Není to totéž co `navigator.onLine`: vypnutý server nechá prohlížeč
   * „online", takže tohle je jediný signál, ze kterého se úvodní obrazovka
   * o výpadku doví.
   */
  stale: boolean;
  /** Projekty, ke kterým je uložený stav — jdou otevřít i bez serveru. */
  offlineReady: Set<string>;
  /** Hláška o neúspěšné operaci; `null` = nic se nepokazilo. */
  error: string | null;
  dismissError: () => void;
  createAndOpen: (name: string) => Promise<string | null>;
  archive: (id: string) => Promise<void>;
  unarchive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Seznam pro případ, kdy server neodpovídá.
 *
 * Skládá se ze dvou zdrojů, protože ani jeden sám nestačí:
 *
 * - `getProjectListCache` má seznam tak, jak přišel ze serveru — tedy včetně
 *   projektů, které uživatel nikdy neotevřel, ale nemusí obsahovat ten, který
 *   založil až po posledním úspěšném načtení.
 * - `listCachedProjects` má naopak přesně ty, ke kterým je uložený stav, tedy
 *   ty jediné, které jdou offline doopravdy otevřít.
 *
 * Přednost má záznam ze serverového seznamu (má úplnější metadata); z cache
 * stavů se doplní jen to, co v něm chybí.
 */
async function offlineProjects(): Promise<ProjectSummary[]> {
  const [listed, cached] = await Promise.all([
    getProjectListCache().catch(() => null),
    listCachedProjects().catch(() => []),
  ]);

  const merged = [...(listed ?? [])];
  const known = new Set(merged.map((project) => project.id));
  for (const project of cached) {
    if (!known.has(project.id)) merged.push(project);
  }
  return merged;
}

/** Načítání seznamu a jeho offline záloha — bez akcí nad projekty. */
function useProjectListData() {
  const [all, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [offlineReady, setOfflineReady] = useState<Set<string>>(() => new Set());

  /**
   * Seznam ze serveru, a když nedojde, poslední známý z cache.
   *
   * Dřív se chyba jen zalogovala do konzole a seznam zůstal prázdný. Uvnitř
   * jednoho sezení to nebylo vidět (neúspěšné načtení nechalo starý stav),
   * ale návratem z projektu se `LandingPage` odmontuje a namontuje znovu —
   * takže po výpadku serveru uživatel uviděl „Žádné uložené projekty" a
   * neměl se jak dostat zpátky do projektu, ve kterém právě byl.
   */
  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await listProjects();
      setProjects(fresh);
      setStale(false);
      await saveProjectListCache(fresh);
    } catch (err) {
      console.error('Nepodařilo se načíst seznam projektů:', err);
      setStale(true);
      setProjects(await offlineProjects());
    } finally {
      setLoading(false);
    }
  }, []);

  // Které projekty mají uložený stav, se zjišťuje nezávisle na seznamu: cache
  // stavu je jediné, co offline rozhoduje o tom, jestli má smysl projekt
  // vůbec otevírat.
  useEffect(() => {
    listCachedProjects()
      .then((cached) => setOfflineReady(new Set(cached.map((project) => project.id))))
      .catch(() => undefined);
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

  return { all, loading, stale, offlineReady, loadProjects };
}

export function useProjectsList(): UseProjectsListResult {
  const { all, loading, stale, offlineReady, loadProjects } = useProjectListData();
  const [error, setError] = useState<string | null>(null);

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
    stale,
    offlineReady,
    createAndOpen,
    archive,
    unarchive,
    remove,
  };
}
