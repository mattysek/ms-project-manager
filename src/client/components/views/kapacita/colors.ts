// Barevné kódování čísel v kapacitách — sdílené tabulkou i souhrnnými kartami.

// Barva celkové kapacity vs. rozpočet — výrazný přesah červeně, mírný žlutě, v pořádku zeleně.
export function budgetColor(grand: number, budget: number): string {
  if (grand > budget + 8) return '#f87171';
  return grand > budget ? '#fbbf24' : '#34d399';
}

// Barva buňky alokace v tabulce kapacit — volno šedě, částečná alokace žlutě, jinak barva osoby.
export function allocColor(isOff: boolean, alloc: number, personColor: string): string {
  if (isOff) return '#334155';
  return alloc < 100 ? '#fbbf24' : personColor;
}

/** Rozdíl „přiřazeno − kapacita": výrazný přetížení červeně, mírný žlutě, jinak zeleně. */
export function diffColor(d: number): string {
  if (d > 8) return '#f87171';
  return d > 0 ? '#fbbf24' : '#34d399';
}
