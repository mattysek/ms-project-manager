// Export filtrovaného seznamu úkolů do Excelu (tasks.feature > Export úkolů
// do Excelu). Čistá funkce beze stavu — volaná přímo z click handleru.
import * as XLSX from 'xlsx';
import type { Categories, PersonWithWeeks, Task } from '../../../types';

const COLUMN_WIDTHS = [
  { wch: 35 }, // Název
  { wch: 18 }, // Osoba
  { wch: 16 }, // Kategorie
  { wch: 10 }, // Začátek (týden)
  { wch: 10 }, // Konec (týden)
  { wch: 8 }, // MD
  { wch: 12 }, // Progress
  { wch: 40 }, // Popis
];

function toRows(tasks: Task[], people: PersonWithWeeks[], cats: Categories) {
  const personMap = new Map(people.map((p) => [p.id, p.name]));
  return tasks.map((task) => ({
    Název: task.name,
    Osoba: personMap.get(task.p) || task.p,
    Kategorie: cats[task.cat]?.label || task.cat,
    'Začátek (týden)': task.s,
    'Konec (týden)': task.e,
    MD: task.md,
    Progress: task.progress ?? 0,
    Popis: task.desc || '',
  }));
}

export function exportTasksToExcel(
  personFiltered: Task[],
  people: PersonWithWeeks[],
  cats: Categories,
  filter: string
): void {
  const data = toRows(personFiltered, people, cats);
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = COLUMN_WIDTHS;

  const wb = XLSX.utils.book_new();
  const filterLabel = filter === 'all' ? 'Vše' : cats[filter]?.label || filter;
  const totalMD = personFiltered.reduce((s, t) => s + Number(t.md), 0).toFixed(1);
  const exportDate = new Date().toLocaleDateString('cs-CZ');

  const headerInfo = [
    [`Seznam úkolů - Export ${exportDate}`],
    [`Filtr: ${filterLabel} | Počet úkolů: ${personFiltered.length} | Celkem MD: ${totalMD}`],
    [],
  ];
  const wsWithHeader = XLSX.utils.aoa_to_sheet(headerInfo);
  XLSX.utils.sheet_add_json(wsWithHeader, data, { origin: 'A4' });
  wsWithHeader['!cols'] = ws['!cols'];
  wsWithHeader['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
  ];

  XLSX.utils.book_append_sheet(wb, wsWithHeader, 'Úkoly');

  const filename = `ukoly_${filterLabel.toLowerCase().replace(/\s+/g, '_')}_${exportDate.replace(/\./g, '-')}.xlsx`;
  XLSX.writeFile(wb, filename);
}
