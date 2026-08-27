// Rozklad ProjectCommand/ProjectDiff na jednotlivé „entity + pole + hodnota"
// zápisy — FR-COLLAB-07: diskrétní notifikace, když diff od JINÉHO uživatele
// přepíše hodnotu pole, které jsem si sám nedávno nastavil.
//
// Klíčový trik: server broadcastuje diff i odesílateli jeho VLASTNÍHO commandu
// (FR-COLLAB-05, „odesílatel ignoruje diff pro svůj optimisticky aplikovaný
// command"). Pokud jsem PC „vyhrál" (server přijal moji hodnotu), diff, který mi
// přijde, bude mít STEJNOU hodnotu, jakou jsem si už nastavil — žádná viditelná
// změna, žádná notifikace. Pokud jsem prohrál (last-write-wins, FR-COLLAB-07),
// diff ponese hodnotu VÍTĚZE, která se od té moji liší → notifikace. Nepotřebuju
// tedy znát identitu odesílatele diffu, stačí porovnat hodnoty.
import type { ProjectCommand } from '../types/protocol';
import type { ProjectDiff } from '../types/protocol';

export interface FieldWrite {
  entityId: string;
  /** Interní klíč pole (`md`, `name`, `s`/`e`, `progress`, …) — mapování na český label dělá UI. */
  field: string;
  value: unknown;
}

function entries(fields: Record<string, unknown>): [string, unknown][] {
  return Object.entries(fields);
}

/** Pole zapsaná commandem, který klient sám odeslal — pro sledování „co jsem si nastavil". */
export function fieldWritesFromCommand(command: ProjectCommand): FieldWrite[] {
  switch (command.type) {
    case 'update_task':
      return entries(command.fields).map(([field, value]) => ({
        entityId: command.taskId,
        field,
        value,
      }));
    case 'move_task':
      return [
        { entityId: command.taskId, field: 's', value: command.s },
        { entityId: command.taskId, field: 'e', value: command.e },
      ];
    case 'update_progress':
      return [{ entityId: command.taskId, field: 'progress', value: command.progress }];
    case 'update_person':
      return entries(command.fields).map(([field, value]) => ({
        entityId: command.personId,
        field,
        value,
      }));
    case 'update_risk':
      return entries(command.fields).map(([field, value]) => ({
        entityId: command.riskId,
        field,
        value,
      }));
    case 'update_opportunity':
      return entries(command.fields).map(([field, value]) => ({
        entityId: command.oppId,
        field,
        value,
      }));
    default:
      return [];
  }
}

/** Pole změněná diffem ze serveru — pro porovnání proti nedávným vlastním zápisům. */
export function fieldWritesFromDiff(diff: ProjectDiff): FieldWrite[] {
  switch (diff.op) {
    case 'task_updated':
      return entries(diff.fields).map(([field, value]) => ({
        entityId: diff.taskId,
        field,
        value,
      }));
    case 'person_updated':
      return entries(diff.fields).map(([field, value]) => ({
        entityId: diff.personId,
        field,
        value,
      }));
    case 'risk_updated':
      return entries(diff.fields).map(([field, value]) => ({
        entityId: diff.riskId,
        field,
        value,
      }));
    case 'opportunity_updated':
      return entries(diff.fields).map(([field, value]) => ({
        entityId: diff.oppId,
        field,
        value,
      }));
    default:
      return [];
  }
}

/** Lidský label pro pole v notifikaci — jen běžné případy, jinak vrací klíč beze změny. */
const FIELD_LABELS: Record<string, string> = {
  md: 'MD',
  name: 'Název',
  progress: 'Progress',
  s: 'Pozice úkolu',
  e: 'Pozice úkolu',
  desc: 'Popis',
  cat: 'Kategorie',
  p: 'Přiřazená osoba',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
