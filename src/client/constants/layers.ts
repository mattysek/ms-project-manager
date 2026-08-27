// Jedna škála pro `z-index`.
//
// Čísla byla dřív rozsypaná po komponentách (1000, 2000, 4000, 5000, 9999,
// 10000) a každé vzniklo samo pro sebe. Výsledek: `TopBar` má 4000, ale
// čtyři celoobrazovkové modály měly 1000–2000, takže jim lišta překrývala
// horní pruh — a v něm sedí tlačítka „Zavřít" a „Stáhnout". Přesně stejná
// chyba jako když lišta polykala klikání na „⬆ Import" a „⬇ Export".
//
// Pravidlo: **nový `z-index` se nevymýšlí, bere se odsud.** Když sem nový
// prvek nezapadá, patří to probrat, ne přičíst nulu.
export const LAYERS = {
  /** Přilepená záhlaví uvnitř view (řádky týdnů, jmenovky osob, součty). */
  stickyHeader: 20,

  /** Tažený pruh v Ganttu — musí být nad sousedy, ne nad zbytkem stránky. */
  draggedBar: 30,

  /** Horní lišta aplikace: nad obsahem, pod vším, co obsah překrývá. */
  topBar: 4000,

  /** Plovoucí panel Quick Notes — nad obsahem i lištou, ale pod dialogy. */
  quickNotes: 5000,

  /**
   * Celoobrazovkové překryvy (náhled souboru, detail úkolu, historie KB,
   * potvrzení smazání, dialog konfliktů).
   *
   * Nad `topBar` schválně: modal zabírá celou obrazovku a jeho ovládání sedí
   * nahoře, přesně tam, kde jinak leží lišta.
   */
  modal: 6000,

  /** Dialog nad dialogem (změna hesla, reset hesla, založení uživatele). */
  dialogOverDialog: 7000,

  /** Tooltip — nad vším, nic nepřekrývá a nic se o něj neopře. */
  tooltip: 8000,
} as const;
