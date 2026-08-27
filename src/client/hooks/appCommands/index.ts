// Skládá dílčí `appCommands/use*` hooky do jednoho objektu slice setterů pro
// App.tsx — viz `types.ts` k důvodu rozdělení (ADR-012 rozpočty na délku
// funkce; CLAUDE.md „rozděl ho na adresář: index.tsx skládá, use*.ts počítá").
import { useTaskAndPersonCommands } from './useTaskAndPersonCommands';
import { useProjectMetaCommands } from './useProjectMetaCommands';
import { useConfigCommands } from './useConfigCommands';
import { useRiskOppCommands } from './useRiskOppCommands';
import { useKbTodoCommands } from './useKbTodoCommands';
import { useFilesCommand } from './useFilesCommand';
import type { AppState } from '../../state/appState';
import type { ProjectCommand } from '../../types/protocol';
import type { TaskAndPersonCommands } from './useTaskAndPersonCommands';
import type { ProjectMetaCommands } from './useProjectMetaCommands';
import type { ConfigCommands } from './useConfigCommands';
import type { RiskOppCommands } from './useRiskOppCommands';
import type { KbTodoCommands } from './useKbTodoCommands';
import type { FilesCommand } from './useFilesCommand';

export interface UseAppCommandsOptions {
  state: AppState | null;
  dispatch: (command: ProjectCommand) => void;
  applyLocal: (mutate: (state: AppState) => AppState) => void;
}

/** Slice settery pro views — protějšek `React.Dispatch<SetStateAction<T>>` z dob lokálního stavu. */
export type AppCommands = TaskAndPersonCommands &
  ProjectMetaCommands &
  ConfigCommands &
  RiskOppCommands &
  KbTodoCommands &
  FilesCommand;

export function useAppCommands(options: UseAppCommandsOptions): AppCommands {
  const { state, dispatch, applyLocal } = options;
  const deps = { state, dispatch };

  return {
    ...useTaskAndPersonCommands(deps),
    ...useProjectMetaCommands(deps),
    ...useConfigCommands(deps),
    ...useRiskOppCommands(deps),
    ...useKbTodoCommands(deps),
    ...useFilesCommand({ dispatch, applyLocal }),
  };
}
