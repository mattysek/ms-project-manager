// Sdílený tvar pro sub-hooky v `appCommands/` — App.tsx je nahrazuje za slice
// settery (`setTasks`, `updateProject`, …), které dřív mutovaly `useUndoRedo`
// stav napřímo, teď skládají `ProjectCommand` a volají `dispatch` z
// `useProjectSession` (ADR-004/ADR-005). Views zůstávají beze změny — dostávají
// stejný `React.Dispatch<SetStateAction<T>>` tvar jako předtím.
import type { AppState } from '../../state/appState';
import type { ProjectCommand } from '../../types/protocol';

export interface AppCommandsDeps {
  /** `null`, dokud nedorazí `full_state`/cache — settery pak no-opují. */
  state: AppState | null;
  dispatch: (command: ProjectCommand) => void;
}
