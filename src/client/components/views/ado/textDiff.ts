// Čistý řádkový diff pro merge editor popisu (FR-ADO-06, 07) — žádné JSX, jen
// spárování a seskupení řádků obou textů.

export interface DiffBlock {
  id: number;
  type: 'same' | 'conflict';
  leftLines: string[];
  rightLines: string[];
}

/** Jeden řádek s tím, kam patří — mezivýsledek mezi spárováním a seskupením. */
interface TaggedLine {
  side: 'same' | 'left' | 'right';
  text: string;
}

/** Rozepsaný stav skládání bloků — mutuje ho `flushBlocks` a `groupTaggedLines`. */
interface DiffAccumulator {
  blocks: DiffBlock[];
  id: number;
  same: string[];
  left: string[];
  right: string[];
}

function flushBlocks(acc: DiffAccumulator): void {
  if (acc.same.length > 0) {
    acc.blocks.push({ id: acc.id++, type: 'same', leftLines: acc.same, rightLines: acc.same });
  }
  if (acc.left.length > 0 || acc.right.length > 0) {
    acc.blocks.push({ id: acc.id++, type: 'conflict', leftLines: acc.left, rightLines: acc.right });
  }
  acc.same = [];
  acc.left = [];
  acc.right = [];
}

/**
 * Která strana se v konfliktu posune dál: přednost má řádek, který na druhé
 * straně vůbec není — jinak by se text posunutý o jeden řádek rozpadl na
 * samé konflikty.
 */
function preferLeftLine(
  a: string | null,
  b: string | null,
  sets: { a: Set<string>; b: Set<string> }
): boolean {
  if (a === null) return false;
  if (b === null) return true;
  return !sets.b.has(a.trim()) || sets.a.has(b.trim());
}

/** Spáruje řádky obou textů a každému přiřadí stranu. */
function alignLines(linesA: string[], linesB: string[]): TaggedLine[] {
  const sets = { a: new Set(linesA.map((l) => l.trim())), b: new Set(linesB.map((l) => l.trim())) };
  const out: TaggedLine[] = [];
  let i = 0;
  let j = 0;

  while (i < linesA.length || j < linesB.length) {
    const a = i < linesA.length ? linesA[i] : null;
    const b = j < linesB.length ? linesB[j] : null;

    if (a !== null && b !== null && a.trim() === b.trim()) {
      out.push({ side: 'same', text: a });
      i++;
      j++;
    } else if (a !== null && preferLeftLine(a, b, sets)) {
      out.push({ side: 'left', text: a });
      i++;
    } else if (b !== null) {
      out.push({ side: 'right', text: b });
      j++;
    } else {
      i++; // nedosažitelné (a i b `null` znamená konec obou) — pojistka proti zacyklení
    }
  }
  return out;
}

/** Slije sousední řádky téže povahy do bloků „shodné" / „konflikt". */
function groupTaggedLines(lines: TaggedLine[]): DiffBlock[] {
  const acc: DiffAccumulator = { blocks: [], id: 0, same: [], left: [], right: [] };

  for (const line of lines) {
    if (line.side === 'same') {
      if (acc.left.length > 0 || acc.right.length > 0) flushBlocks(acc);
      acc.same.push(line.text);
    } else {
      if (acc.same.length > 0) flushBlocks(acc);
      (line.side === 'left' ? acc.left : acc.right).push(line.text);
    }
  }
  flushBlocks(acc);
  return acc.blocks;
}

/** Řádkový diff plánovač (vlevo) vs. ADO (vpravo); shodné řádky se slučují do bloků. */
export function computeDiffBlocks(textA: string, textB: string): DiffBlock[] {
  return groupTaggedLines(alignLines(textA.split('\n'), textB.split('\n')));
}

export type Side = 'left' | 'right' | 'both';

export function mergeText(
  blocks: DiffBlock[],
  selections: Record<number, Side | undefined>
): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === 'same') {
      out.push(...block.leftLines);
      continue;
    }
    const side = selections[block.id];
    if (side === 'left' || side === 'both') out.push(...block.leftLines);
    if (side === 'right' || side === 'both') out.push(...block.rightLines);
  }
  return out.join('\n');
}
