// Čistě klientské pomůcky ADO Sync — po ADR-008 to je JEDINÝ ADO modul na
// klientovi. Nevolá ADO API, nezná PAT a nic neukládá; všechno tady je buď
// parsování URL, nebo prezentační přepočet pro předvyplnění formuláře.
//
// Detekce změn, snapshot, mapování identit i konverze popisu HTML↔markdown
// žijí na serveru (`Domain/AdoSync.fs`, `Domain/AdoChanges.fs`) — klient
// dostává hotový výsledek jako diff.
import type { ADOSyncLogEntry, Task, WIChangeSeverity } from '../types';

// ── URL work itemu ──────────────────────────────────────────────────────────

/** Rozpoznání ADO odkazu na work item — dev.azure.com, visualstudio.com i on-premise TFS. */
export function isAdoUrl(url: string): boolean {
  return url.includes('/_workitems/edit/');
}

/** Odkaz na work item pro `Task.links` a pro tlačítko „Otevřít v ADO". */
export function buildWiUrl(config: { orgUrl: string; project: string }, id: number): string {
  return `${config.orgUrl}/${encodeURIComponent(config.project)}/_workitems/edit/${id}`;
}

/** Úkoly bez vazby na ADO (FR-ADO-08). Backlog (osoba nepřiřazena) se přeskakuje. */
export function tasksWithoutAdoLink(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.p && !task.links?.some((link) => isAdoUrl(link.url)));
}

// ── MD ↔ hodiny (FR-ADO-01, `mdToHoursCoefficient`) ─────────────────────────
//
// Server počítá totéž při detekci změn; tady jde jen o předvyplnění pole
// „Remaining Work" ve formuláři, hodnotu pak posílá uživatel v draftu.

export function mdToHours(md: number, coefficient: number): number {
  return md * coefficient;
}

export function hoursToMd(hours: number, coefficient: number): number {
  return hours / coefficient;
}

// ── Prezentace ──────────────────────────────────────────────────────────────

export interface SeverityBadgeStyle {
  bg: string;
  bd: string;
  tx: string;
  icon: string;
}

/** Barvy a ikona podle závažnosti změny (FR-ADO-05). */
export function severityBadge(severity: WIChangeSeverity): SeverityBadgeStyle {
  switch (severity) {
    case 'high':
      return { bg: '#2a1010', bd: '#f87171', tx: '#fca5a5', icon: '🔴' };
    case 'medium':
      return { bg: '#2a2010', bd: '#f59e0b', tx: '#fcd34d', icon: '🟡' };
    case 'info':
      return { bg: '#1a2a10', bd: '#34d399', tx: '#6ee7b7', icon: '🟢' };
    default:
      return { bg: '#0c1a2a', bd: '#4f9cf9', tx: '#93c5fd', icon: '🔵' };
  }
}

/**
 * Navrhovaný cílový stav při uzavírání work itemu z plánovače (FR-ADO-07).
 * Stavy závisí na procesní šabloně ADO, proto je to jen předvyplnění pole.
 */
export function defaultResolvedState(wiType: string): string {
  switch (wiType.toLowerCase()) {
    case 'bug':
      return 'Resolved';
    case 'product backlog item':
    case 'user story':
      return 'Done';
    default:
      return 'Closed';
  }
}

/** Formát data pro sync log a timestamp poslední synchronizace. */
export function formatAdoDate(iso: string): string {
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Export sync logu (FR-ADO-10) ────────────────────────────────────────────

const SYNC_LOG_CSV_HEADER = ['Datum', 'Akce', 'ID úkolu', 'Úkol', 'WI', 'Název WI', 'Detail'];

/** Escapuje jednu CSV buňku — obalí uvozovkami, pokud obsahuje čárku, uvozovku nebo nový řádek. */
function csvCell(value: string | number | undefined): string {
  const s = value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Sync log jako CSV (FR-ADO-10, PM only — vynucení oprávnění je na volajícím).
 * `﻿` na začátku je BOM, aby Excel rozpoznal UTF-8 kódování diakritiky.
 */
export function syncLogToCsv(entries: ADOSyncLogEntry[]): string {
  const rows = entries.map((e) =>
    [formatAdoDate(e.timestamp), e.action, e.taskId, e.taskName, e.wiId, e.wiTitle, e.details]
      .map(csvCell)
      .join(',')
  );
  return `﻿${[SYNC_LOG_CSV_HEADER.join(','), ...rows].join('\r\n')}`;
}
