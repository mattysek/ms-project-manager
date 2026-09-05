// Export výkazů do Excelu (FR-WL-09). Čistá funkce beze stavu, volaná přímo
// z click handleru — stejně jako `views/Seznam/exportTasksToExcel.ts`.
//
// Exportuje se **to, co je po filtru vidět**, ne celá historie: uživatel si
// období i filtr nastavil právě proto, aby dostal tenhle výřez.
import * as XLSX from 'xlsx';
import type { WorkLogEntry } from '../../api/worklogApi';
import {
  NO_PROJECT_LABEL,
  durationMs,
  formatDuration,
  isRunning,
  localDayKey,
  localTime,
  toHours,
} from '../../utils/worklog';

const COLUMN_WIDTHS = [
  { wch: 12 }, // Datum
  { wch: 8 }, // Začátek
  { wch: 8 }, // Konec
  { wch: 12 }, // Trvání (h)
  { wch: 12 }, // Trvání (hh:mm)
  { wch: 35 }, // Název
  { wch: 40 }, // Popis
  { wch: 24 }, // Projekt
  { wch: 24 }, // Tagy
];

export interface WorkLogExportContext {
  periodLabel: string;
  filterLabel: string;
  projectNames: Map<string, string>;
}

function toRow(entry: WorkLogEntry, projectNames: Map<string, string>) {
  const ms = durationMs(entry, Date.now());
  return {
    Datum: localDayKey(entry.startedAt),
    Začátek: localTime(entry.startedAt),
    Konec: entry.endedAt ? localTime(entry.endedAt) : '',
    'Trvání (h)': toHours(ms),
    'Trvání (hh:mm)': formatDuration(ms),
    Název: entry.title,
    Popis: entry.description,
    Projekt: entry.projectId
      ? (projectNames.get(entry.projectId) ?? entry.projectId)
      : NO_PROJECT_LABEL,
    Tagy: entry.tags.join(', '),
  };
}

export function exportWorkLogToExcel(entries: WorkLogEntry[], context: WorkLogExportContext): void {
  // Běžící záznam nemá konec, takže by ve sloupci trvání lhal — do souboru
  // nepatří (FR-WL-09).
  const finished = entries.filter((entry) => !isRunning(entry));
  const data = finished.map((entry) => toRow(entry, context.projectNames));
  const totalMs = finished.reduce((sum, entry) => sum + durationMs(entry, Date.now()), 0);

  const header = [
    [`Výkaz práce — ${context.periodLabel}`],
    [
      `Filtr: ${context.filterLabel} | Počet záznamů: ${finished.length} | Celkem: ${formatDuration(totalMs)}`,
    ],
    [],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(sheet, data, { origin: 'A4' });
  sheet['!cols'] = COLUMN_WIDTHS;
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Výkaz');
  XLSX.writeFile(book, `vykaz_${context.periodLabel.replace(/[^\d]+/g, '-')}.xlsx`);
}
