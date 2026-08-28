// Globální setup pro Vitest — spouští se před každým test souborem
// (viz `setupFiles` ve vitest.config.ts).
//
// `@testing-library/jest-dom/vitest` rozšiřuje `expect` o DOM matchery
// (`toBeInTheDocument`, `toHaveTextContent`, …) a zároveň dodává jejich typy
// přes module augmentation nad `vitest` — proto zde není potřeba `globals: true`
// ani ruční přidávání typů do tsconfig.json.
import '@testing-library/jest-dom/vitest';

// jsdom neimplementuje IndexedDB — `fake-indexeddb/auto` napojí globální
// `indexedDB`/`IDBKeyRange` na in-memory implementaci, takže `src/storage/*`
// (offline queue, project cache) jde testovat beze změny produkčního kódu.
import 'fake-indexeddb/auto';

// `@testing-library/react` by tohle normálně zaregistrovalo samo — ale jen
// pokud v okamžiku jeho importu existuje globální `afterEach` (viz jeho
// zdrojový kód). `vitest.config.ts` záměrně nemá `test.globals: true` (ADR-011:
// testovací nastavení má být explicitní), takže globální `afterEach` v době
// importu RTL neexistuje a auto-cleanup se nezaregistruje. Bez tohohle by
// komponenty vykreslené v jednom testu zůstávaly v `document.body` i pro další
// testy ve stejném souboru — `screen.getByText(...)` by pak nacházel duplicity.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom nemá layout, takže `document.elementFromPoint` vůbec neimplementuje.
// Gantt ho používá při tažení k nalezení řádku pod kurzorem (`findRowPersonId`)
// — bez tohohle doplnění by každý drag test spadl na `is not a function`.
//
// Vrací `null`, tedy „pod kurzorem není žádný řádek", což `computeMovePreview`
// vyhodnotí jako „zůstaň u původní osoby". Přeřazení mezi řádky se tím
// jednotkově otestovat nedá a ani nemá — je to čistě geometrická věc, kterou
// pokrývá E2E (`gantt.spec.ts`).
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}

// jsdom nemá layout, takže neimplementuje ani `scrollIntoView` — volání by
// spadlo na „is not a function". „Moje práce" ho používá k posunu na aktuální
// týden (FR-WORK-07); testy si ho mockují a ověřují, že se zavolal nad tím
// správným prvkem. Že se doopravdy odroluje, ověří až E2E.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}
