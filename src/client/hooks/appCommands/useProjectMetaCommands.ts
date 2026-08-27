import { useCallback } from 'react';
import type { ChangelogEntry, Milestone, Project } from '../../types';
import type { AppCommandsDeps } from './types';

export interface ProjectMetaCommands {
  updateProject: (field: keyof Project, val: string | number | ChangelogEntry[]) => void;
  setMilestones: (milestones: Milestone[]) => void;
  changeDates: (field: 'startDate' | 'endDate', val: string) => void;
}

/**
 * `updateProject`/`setMilestones`/`changeDates` pro ProjektView/RizikaView.
 *
 * `changeDates` už NEPŘEPOČÍTÁVÁ `weekAlloc`/`s`/`e` lokálně — to dřív dělal
 * `App.tsx` ručně, ale ADR-004 doplněk („Změna datumů projektu přepočítává
 * stav na serveru") tuhle mutaci svěřuje actoru; klient jen pošle nové datumy
 * a čeká na navazující `task_updated`/`person_updated` diffy.
 */
export function useProjectMetaCommands({ dispatch }: AppCommandsDeps): ProjectMetaCommands {
  const updateProject = useCallback(
    (field: keyof Project, val: string | number | ChangelogEntry[]) => {
      dispatch({ type: 'update_project', fields: { [field]: val } as Partial<Project> });
    },
    [dispatch]
  );

  const setMilestones = useCallback(
    (milestones: Milestone[]) => dispatch({ type: 'set_milestones', milestones }),
    [dispatch]
  );

  const changeDates = useCallback(
    (field: 'startDate' | 'endDate', val: string) => {
      dispatch({ type: 'update_project', fields: { [field]: val } });
    },
    [dispatch]
  );

  return { updateProject, setMilestones, changeDates };
}
