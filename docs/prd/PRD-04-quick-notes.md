# PRD-04: Quick Notes — osobní poznámky

## Přehled

Quick Notes jsou per-user markdown poznámky sloužící k zachycení myšlenek, dočasných informací a věcí, které teprve budou zanášeny do úkolů. Jsou dostupné vždy bez ohledu na aktuální view nebo projekt. Klíčová vlastnost: poznámku lze konvertovat na úkol v aktuálním projektu.

## Cíle

- Uživatel má vždy rychlý přístup k osobním poznámkám bez nutnosti navigovat na jiný view
- Poznámky jsou soukromé — jiní uživatelé je nevidí
- Plynulý workflow: poznámka → úkol jedním klikem

## Non-goals

- Sdílené týmové poznámky (to je KB view)
- Tagy / labels pro poznámky
- Attachmenty v poznámkách
- Export poznámek
- Synchronizace poznámek přes zařízení (sdíleny přes server, ale to je přirozené)

## Uživatelé a role

| Aktér | Přístup |
|---|---|
| **PM** | R/W vlastní quick notes |
| **Dev** | R/W vlastní quick notes |
| **Jiný uživatel** | Žádný přístup (server odmítne read i write cizích notes) |

## Funkcionální požadavky

### FR-QN-01: Přístup k panelu
- Quick Notes panel je přístupný z Header — ikona nebo tlačítko "📝 Poznámky" viditelné vždy
- Panel se otevírá jako floating sidebar vpravo (nezakrývá celý obsah stránky)
- Panel je dostupný na všech views i na LandingPage (bez otevřeného projektu)
- Stav panelu (otevřen/zavřen) je persisted v localStorage (ne v DB)

### FR-QN-02: Zobrazení seznamu poznámek
- Panel zobrazuje seznam poznámek seřazených sestupně dle `updated_at`
- Každá položka: první řádek obsahu (truncated na 2 řádky), datum poslední úpravy
- Pokud je poznámka konvertována na úkol, zobrazí se tag "→ Úkol" s názvem úkolu (pokud je znám)
- Vyhledávání: fulltext search pole nahoře v panelu; filtruje real-time client-side

### FR-QN-03: Přidání poznámky
- Tlačítko "+ Nová poznámka" nahoře v panelu
- Nová prázdná poznámka se otevře v edit módu
- Automaticky se uloží při blur (opuštění input pole) a každých 30 sekund při aktivní editaci
- Minimální obsah: 1 znak (prázdné poznámky se neukládají)

### FR-QN-04: Editace poznámky
- Klik na poznámku v seznamu otevře editační view uvnitř panelu
- Editor: markdown textarea s live preview (toggle edit/preview jako v KB view)
- Obsah se autosave 2 sekundy po poslední změně (debounce)
- Tlačítka: "Uložit" (explicitní), "Smazat", "→ Přidat jako úkol" (pouze pokud je otevřený projekt)
- Zobrazení: `Vytvořeno: 12.8.2026 14:30`, `Upraveno: 13.8.2026 09:15`

### FR-QN-05: Smazání poznámky
- Tlačítko "Smazat" v editačním view
- Potvrzovací dialog: "Opravdu smazat tuto poznámku? Tuto akci nelze vrátit."
- Smazaná poznámka je trvale odstraněna (žádný košík/archiv)

### FR-QN-06: Link na projekt
- V editačním view: dropdown "Přiřadit k projektu" — seznam projektů, jejichž je uživatel členem
- Volitelné — poznámka nemusí být přiřazena k projektu
- Přiřazená poznámka zobrazuje název projektu jako tag
- V panelu lze filtrovat poznámky dle projektu

### FR-QN-07: Konverze poznámky na úkol
- Tlačítko "→ Přidat jako úkol" je aktivní pouze pokud:
  1. Je otevřený projekt (uživatel má projekt v kontextu)
  2. Uživatel má oprávnění přidat úkol v daném projektu
- Po kliknutí se otevře `TaskDetailModal` s předvyplněnými poli:
  - `name`: první řádek poznámky (nebo prvních 60 znaků)
  - `desc`: celý obsah poznámky (jako markdown)
  - Ostatní pole: výchozí hodnoty (backlog, aktuální uživatel, 1 MD)
- Po uložení úkolu:
  - Poznámka se označí jako konvertovaná: `converted_to_task_id = taskId`
  - Poznámka zůstává v seznamu ale je označena tagem "→ Úkol: [název úkolu]"
  - Poznámka je read-only (nelze ji konvertovat znovu)

### FR-QN-08: Persistence a synchronizace
- Quick notes jsou uloženy v DB tabulce `quick_notes` (per user)
- Při otevření panelu: notes se načtou z serveru přes REST `GET /api/quick-notes`
- Změny se ukládají přes REST `PATCH /api/quick-notes/{id}` (ne přes SignalR — poznámky jsou per-user a nevyžadují broadcast)
- Nová poznámka: `POST /api/quick-notes`
- Smazání: `DELETE /api/quick-notes/{id}`

## Non-funkcionální požadavky

- Panel se otevře do 200ms od kliknutí na tlačítko (lokální stav + lazy load z API)
- Fulltext search: real-time client-side bez round-tripu (notes jsou načteny do paměti)
- Autosave debounce: 2 sekundy
- Maximální počet poznámek per user: 500 (warning při překročení 400)
- Maximální délka obsahu poznámky: 10 000 znaků

## Out of scope

- Real-time sync quick notes přes SignalR (jsou per-user, bez potřeby broadcast)
- Sdílení konkrétní poznámky s jiným uživatelem
- Markdown attachment images (inline obrázky v poznámkách)
- Verze/history poznámek
