// Otevření/zavření projektu + odhlášení — drží URL (`useRoute`) v souladu se
// stavem `currentProjectId`. Vytaženo z `AuthenticatedApp`, aby zůstala pod
// rozpočtem ADR-012 (délka funkce).
import { useCallback, useState } from 'react';
import type { Route } from './useRoute';
import type { ViewType } from '../types';
import type { AuthenticatedAuth } from './useAuth';

export interface UseAppNavigationResult {
  loadProject: (id: string) => void;
  /**
   * Otevře projekt rovnou na Úkolech a rozbalí detail konkrétního úkolu.
   *
   * Cesta z přehledu „Moje práce": kliknutí na úkol má ukázat ten úkol, ne jen
   * projekt, ve kterém leží. Vlastní obrazovka pro detail nevzniká — úkol se
   * ukazuje tam, kde se i edituje, tedy v `TaskDetailModal` nad Úkoly.
   */
  loadProjectTask: (projectId: string, taskId: string) => void;
  /** Úkol, jehož detail se má otevřít po načtení projektu; jednorázový. */
  pendingTaskId: string | null;
  clearPendingTask: () => void;
  /** Přehled napříč projekty (PRD-08). */
  openMyWork: () => void;
  closeProject: () => void;
  handleLogout: () => void;
}

export function useAppNavigation(
  route: Route,
  setCurrentProjectId: (id: string | null) => void,
  setView: (view: ViewType) => void,
  auth: AuthenticatedAuth
): UseAppNavigationResult {
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const closeProject = useCallback(() => {
    setCurrentProjectId(null);
    setPendingTaskId(null);
    route.navigate('/');
  }, [route, setCurrentProjectId]);

  const loadProject = useCallback(
    (id: string) => {
      setCurrentProjectId(id);
      setView('projekt');
      route.navigate(`/projects/${id}`);
    },
    [route, setCurrentProjectId, setView]
  );

  const loadProjectTask = useCallback(
    (projectId: string, taskId: string) => {
      // `pendingTaskId` se nastavuje PŘED přepnutím projektu: `AppViews` se
      // překreslí hned a jinak by první render Úkolů přišel bez něj.
      setPendingTaskId(taskId);
      setCurrentProjectId(projectId);
      setView('seznam');
      route.navigate(`/projects/${projectId}`);
    },
    [route, setCurrentProjectId, setView]
  );

  const handleLogout = useCallback(() => {
    closeProject();
    auth.logout();
  }, [closeProject, auth]);

  const openMyWork = useCallback(() => route.navigate('/moje-prace'), [route]);

  return {
    loadProject,
    loadProjectTask,
    pendingTaskId,
    clearPendingTask: useCallback(() => setPendingTaskId(null), []),
    closeProject,
    handleLogout,
    openMyWork,
  };
}
