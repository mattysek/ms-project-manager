// Sdílené typy pro sekci Coverage gap (FR-ADO-09) — používá je jak formulář
// „Přidat do plánu", tak samotný seznam gapů.
import type { ADOConfig, Categories, Person, Task } from '../../../types';

export interface GapContext {
  people: Person[];
  cats: Categories;
  tasks: Task[];
  numWeeks: number;
  config: ADOConfig;
}
