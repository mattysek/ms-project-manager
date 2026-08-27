# ADR-005: Rozdělení logiky mezi klienta a server

## Status
Přijato

## Kontext

Přepisem na server-backed architekturu vzniká otázka: co zůstane na klientovi a co se přesune na server? Špatné rozdělení vede buď k nadbytečným round-tripům (vše na serveru) nebo k bezpečnostním problémům a nekonzistenci (vše na klientovi).

## Rozhodnutí

### Zůstává na klientovi — pure computation bez side effects

Tato logika je **deterministická**, **bez persistence** a **bez bezpečnostních implikací**. Přesunutí na server by přidalo round-tripy bez jakéhokoliv přínosu.

| Modul / funkce | Důvod |
|---|---|
| `dates.ts` — `czechHolidays`, `easterSunday`, `isWorkday`, `parseLocalDate`, `toISO`, `addDays` | Deterministický výpočet českých svátků; výsledek závisí pouze na roce/datu, žádná DB data |
| `weeks.ts` — `computeWeeks`, `computeMonthGroups` | Derivováno ze `startDate`/`endDate`/`milestones` — počítá se z dat která klient má; mění se pouze při změně datumů projektu |
| `helpers.ts` — `buildLanes`, `assignLanes`, `injectWeeks`, `personTotalMD`, `weekMD` | Gantt layout a MD výpočty — derived state z tasks + people; vhodné pro `useMemo` |
| `htmlMarkdownConverter.ts` — `htmlToMarkdown`, `markdownToHtml`, `computeDescriptionHash`, `areDescriptionsEqual` | Rendering markdownu, hash pro ADO desc diff — pure transformace textu |
| `useUndoRedo.ts` | Per-session undo buffer je inherentně klientský stav |
| Gantt drag mechanika (GanttView) | Lokální UI interakce; command se pošle teprve při `mouseup` (konci dragu), ne při každém pohybu |
| Excel export (`xlsx`) | Generuje soubor v browseru ze stavu který klient má |
| PNG export (`html2canvas`) | Screenshot Gantt view — vyžaduje přístup k DOM |
| Import parsing — `parseImportFile` (`importExport.ts`) | Parsuje JSON/ZIP soubor, výsledek se pošle jako serie commandů na server |
| Fulltext search v KB a Quick Notes | Client-side filtrování nad daty která jsou v lokálním stavu |

### Přesouvá se na server

| Funkcionalita | Důvod |
|---|---|
| Veškerá persistence | IndexedDB → SQLite; autoritativní stav je na serveru |
| Autentizace a autorizace | ASP.NET Core Identity; permissions musí být enforcovány server-side |
| Project CRUD (create, list, delete) | Změny databáze projektů |
| Všechny state mutace | Commands → ProjectActor → diff broadcast |
| File storage a download | BLOB v SQLite, přístup přes `GET /api/files/:id` |
| ADO PAT storage | Encrypted v DB, per user per project; nikdy v browseru |
| ADO API volání | Proxy přes server — viz ADR-008 |
| Quick notes persistence | CRUD v DB per user |
| Auto-save | Debounced persist v ProjectActor; `useAutoSave` hook na klientovi se odstraní |
| Sync log záznamy | Ukládány v project state na serveru |

## Alternativy

### Vše na serveru (SSR / server-side rendering)
- **Pro:** maximální konzistence, tenký klient
- **Proti:** ztratíme bohatý React UI (Gantt drag, real-time výpočty), každá interakce = round-trip, latence by znemožnila drag-and-drop UX

### Vše na klientovi (P2P nebo masterless sync)
- **Pro:** zachování současné architektury
- **Proti:** nelze sdílet data mezi uživateli bez centrálního bodu, žádná auth, žádná autorita

## Důsledky

**Pozitivní:**
- Klient zůstává výkonný pro výpočetní operace (výpočet týdnů, layout, rendering) — žádná latence pro derived state
- Server řeší jen to, co musí (persistence, auth, broadcast) — jednoduchý actor
- Svátky, weeks, lanes se počítají lokálně = okamžitá odezva při změně datumů projektu

**Negativní:**
- Logika svátků existuje v TypeScript a případně pokud je potřeba i na serveru (F#) musí být replikována — ale pro tento use case server svátky nepotřebuje
- Import parsing zůstává na klientovi: velké ZIP soubory mohou zatěžovat browser; pro tento rozsah (15 uživatelů, málo příloh) je to přijatelné

**Implementační poznámky:**
- Po importu souboru klient pošle `full_state_import` command se všemi daty — server ho aplikuje jako kompletní reset stavu projektu
- `useAutoSave` hook se odstraní kompletně; jeho funkcionalitu přebírá `ProjectActor.Persist` timer
