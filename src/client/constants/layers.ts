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

  /**
   * Plovoucí panely v horní liště (Quick Notes, Trezor) — nad obsahem
   * i lištou, ale pod dialogy.
   *
   * Jméno je obecné schválně: panely jsou dva a chovají se stejně, takže
   * vázat vrstvu na jeden z nich by svádělo k tomu dát druhému vlastní číslo.
   */
  floatingPanel: 5000,

  /**
   * Rozbalené uživatelské menu v liště — **nad** plovoucími panely.
   *
   * Panely i menu se renderují uvnitř `TopBar`, takže o pořadí rozhoduje
   * z-index v jeho stacking kontextu, ne globální hodnota lišty. Dokud mělo
   * menu jen `topBar + 1`, otevřený trezor ho překryl a „Změna hesla" nešla
   * kliknout — vypadalo to, že menu chybí, přitom bylo jen pod panelem.
   */
  userMenu: 5500,

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
