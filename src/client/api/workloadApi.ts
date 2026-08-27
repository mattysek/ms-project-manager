// Přehled práce napříč projekty (PRD-08).
//
// Jediné REST volání, které nepatří k jednomu projektu — proto `me`, ne
// `projects/{id}`. Server vrací fakta (co, kdy, kolik MD), kapacitu si dopočítá
// klient z českých svátků a pracovních dnů (ADR-005).
import { apiRequest } from './httpClient';

export interface MyTask {
  projectId: string;
  projectName: string;
  taskId: string;
  name: string;
  cat: string;
  md: number;
  progress: number;
  /** Pondělí prvního týdne úkolu; chybí u projektu bez platných datumů. */
  fromIso?: string;
  /** Pátek posledního týdne úkolu. */
  toIso?: string;
}

export interface Workload {
  /** O kolik sekund může být přehled pozadu — actor persistuje po ticku (ADR-015). */
  staleAfterSeconds: number;
  tasks: MyTask[];
}

export async function fetchMyWorkload(): Promise<Workload> {
  return apiRequest<Workload>('/api/me/workload');
}
