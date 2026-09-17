# ADR-008: ADO REST API proxy přes server

## Status
Přijato

## Kontext

Současná verze volá Azure DevOps REST API přímo z browseru pomocí PAT (Personal Access Token). PAT je uložen v IndexedDB prohlížeče. V multi-user verzi se PAT musí ukládat per-user, per-projekt. Otázka je, zda volání ADO API ponechat na klientovi nebo přesunout na server.

## Rozhodnutí

**ADO REST API volání jsou proxovány přes server. PAT nikdy neopustí server.**

- PAT zadá uživatel v ADO Sync view → pošle se jako command `{ type: "ado_save_pat", pat: "..." }` → server ho uloží encrypted (AES-256 s machine key) v tabulce `ado_credentials`
- Klient **nikdy nedostane PAT zpět** — ani při načítání konfigurace
- Při ADO operacích klient pošle command (např. `{ type: "ado_sync" }`) → server načte PAT z DB, provede HTTP volání na ADO, výsledek vrátí přes SignalR diff
- `adoApi.ts` na klientovi se odstraní; jeho logika se přepíše do F# (`AdoApiClient` modul)

### Server-side ADO API wrapper (F#)

```fsharp
module AdoApiClient =
    let private createClient (pat: string) =
        let client = new HttpClient()
        let encoded = Convert.ToBase64String(Encoding.ASCII.GetBytes($":{pat}"))
        client.DefaultRequestHeaders.Authorization <- AuthenticationHeaderValue("Basic", encoded)
        client

    let fetchWorkItems (config: ADOConfig) (pat: string) (ids: int list) : Async<ADOWorkItem list> =
        async {
            use client = createClient pat
            let url = $"{config.OrgUrl}/_apis/wit/workitems?ids={String.concat "," (ids |> List.map string)}&api-version=7.1"
            let! response = client.GetAsync(url) |> Async.AwaitTask
            // ...
        }
```

### Šifrování PAT

```fsharp
// Použití ASP.NET Core Data Protection API
let encrypt (protector: IDataProtector) (pat: string) : string =
    protector.Protect(pat)

let decrypt (protector: IDataProtector) (encrypted: string) : string =
    protector.Unprotect(encrypted)
```

`IDataProtectionProvider` s purpose `"ado-pat"` — klíče jsou automaticky spravovány ASP.NET Core, rotace je možná.

## Alternativy

### Přímé volání z browseru (zachování současného stavu)
- **Pro:** jednodušší, klient má full control, žádný proxy overhead
- **Proti:** PAT musí být přenesen do browseru → uložen v paměti nebo localStorage (XSS riziko); při multi-user sdílení PAT jeden uživatel vidí PAT jiného; CORS na ADO funguje, ale je to edge case který Microsoft může změnit

### Server-Sent Events místo WebSocket pro ADO výsledky
- **Pro:** jednosměrné streaming výsledků
- **Proti:** ADO sync je request-response, ne stream; SignalR je již v projektu, není důvod přidávat SSE

## Důsledky

**Pozitivní:**
- PAT je uložen encrypted na serveru, nikdy v browseru → eliminuje XSS riziko exfiltrace PAT
- Server-side HttpClient bez CORS omezení → žádné problémy s preflighted requests
- Volání ADO API lze logovat na serveru (audit trail) — kdo spustil sync, kdy, s jakým výsledkem
- Při změně ADO PAT není nutný reload klienta

**Negativní:**
- ADO sync operace jsou nyní asynchronní server-side → klient musí čekat na SignalR diff místo přímé response; UI musí zobrazovat stav "synchronizuji..."
- Server potřebuje outbound přístup na `dev.azure.com` — firewall konfigurace na Windows VM
- `adoApi.ts` (435 řádků) a `adoSync.ts` (503 řádků) se musí přepsat do F# — signifikantní práce

**Implementační poznámky:**
- ADO sync operace jsou spouštěny jako `Async.Start` z ProjectActor mailboxu — actor pošle progress updaty přes SignalR průběžně
- Snapshot (diff baseline) je uložen v `ado_credentials` tabulce jako JSON sloupec `snapshot_json`
- `adoSyncLog` se ukládá v project state (`state_json`) — actor ho mutuje jako standardní část stavu

---

## Doplněk: kde žijí klíče Data Protection

**Status:** přijato 2026-08-17

Rozhodnutí „PAT se šifruje Data Protection API" bylo neúplné — neříkalo, kde
žije key ring, kterým se šifruje. Bez konfigurace přitom `AddDataProtection()`
sáhne po výchozím chování a to je pro Windows Service špatně:

- klíče jdou do `%LOCALAPPDATA%\ASP.NET\DataProtection-Keys` účtu procesu;
- pod účtem **bez načteného uživatelského profilu** (běžné u service accountů)
  Data Protection jen zaloguje varování a drží klíče **v paměti**. Každý restart
  služby pak vyrobí nový klíč a všechny uložené PATy jsou nedešifrovatelné;
- výchozí application discriminator se odvozuje z content rootu, takže i přesun
  instalační složky klíče znehodnotí.

Selhání je tiché: projeví se až prvním syncem po restartu.

### Rozhodnutí

```fsharp
services.AddDataProtection()
    .SetApplicationName("MSProjectManager")
    .PersistKeysToFileSystem(DirectoryInfo keysPath)
    .ProtectKeysWithDpapi(protectToLocalMachine = true)   // jen na Windows
```

- `SetApplicationName` — discriminator nezávisí na instalační cestě.
- `PersistKeysToFileSystem` — složka z `DataProtection:KeysPath`, výchozí
  `keys/` vedle služby (viz PRD-00, Nasazení).
- `ProtectKeysWithDpapi(protectToLocalMachine = true)` — key ring je svázaný
  se **strojem**, ne s účtem. Změna účtu služby tedy PATy nezničí.

DPAPI je Windows-only, proto je volání pod `OperatingSystem.IsWindows()`.
V dev prostředí, testech a kontejnerech zůstává key ring na disku nešifrovaný —
pro neprodukční běh přijatelné.

### Cena, kterou vědomě platíme

**Obnova zálohy na jiném stroji PATy nedešifruje.** DPAPI local-machine je
váže k tomu konkrétnímu stroji. Uživatelé PAT zadají znovu (minuta práce, PATy
stejně expirují) — proti tomu stojí, že záloha databáze sama o sobě tajemství
neodnese.

Zvažované alternativy:

| | DPAPI (local machine) | Certifikát | Klíč v appsettings |
|---|---|---|---|
| Přežije změnu účtu služby | ano | ano | ano |
| Přežije obnovu na jiný stroj | **ne** | ano | ano |
| Chrání proti přístupu k souborům VM | ano | jen když je cert jinde | **ne** |

Klíč v `appsettings.json` je **zamítnut**: leží ve stejné složce jako databáze,
takže kdo se dostane k jednomu, má i druhé. Je to obfuskace, ne šifrování.

### Provozní důsledek

Key ring patří do zálohy spolu s databází — jinak jsou PATy po obnově pryč.
Zároveň platí, že záloha odnesená na jiný stroj je bez klíčů nepoužitelná,
což je pro únik zálohy dobrá zpráva a pro disaster recovery špatná. Je to
volba, ne nedopatření.

## Doplněk: co všechno musí sync umět zapomenout

**Status:** přijato 2026-09-17

Sync hlásil změny, které žádné nebyly, a nehlásil je pryč, když už vyřešené
byly. Čtyři různé příznaky, tři společné příčiny — všechny v tom, že
**baseline, klíč rozhodnutí a stav PATu žijí mimo `AppState`**, a nic je
nedrželo v souladu s tím, co uživatel právě udělal.

### Po zápisu do ADO se srovnává baseline

`runSync` uloží snapshot s hodnotami, které v ADO byly. Push (přiřazení, stav,
popis) je vzápětí změní — a snapshot o tom neví. Další sync proto porovná nové
ADO se starou baseline a nabídne uživateli k potvrzení **jeho vlastní změnu**,
navíc obráceně: „v ADO je přiřazen někdo jiný než v plánovači" hned po tom, co
to tam sám propsal.

`AdoBridgeActions.rebaseline` proto po každém úspěšném zápisu work item znovu
stáhne a přepíše jeho položku ve snapshotu (`refreshSnapshotItem`). Stahuje se
znovu schválně: posíláme e-mail identity, kdežto baseline drží zobrazované
jméno, které umí přiřadit jen ADO. Selhání dotazu akci neshodí — push proběhl,
chyba by tvrdila opak; baseline zůstane stará a rozdíl se ohlásí jednou navíc.

### Klíč potvrzení má jediný tvar

Klíč nese i pozorovanou hodnotu (`1234-state_regression-New`), aby potvrzení
platilo jen pro to, co uživatel viděl. Skládal se ale na třech místech různě:
`withoutAcknowledged` ho bral z `WiChange.NewValue`, zápis rozhodnutí ze
snapshotu (`acknowledgedValue`), a klient hodnotu nepřidával vůbec. Důsledek:
odkliknutá změna se vrátila při dalším syncu, u `planner_assignment_differs`
vždycky.

Tvar klíče teď určuje `Ado.changeKeyOf` a klient ho zrcadlí jednou funkcí.
Typy, které se na hodnotu neváží (`new_bug_child`, `planner_assignment_differs`),
mají klíč bez ní **na obou stranách**.

### Rozhodnutí uživatele ≠ odbavený řádek

Push a přebrání hodnoty nevrací diff, kterým by změna ze seznamu zmizela —
server o seznamu nic neví, ten vzniká až během syncu. Klik proto vypadal jako
by nic neudělal. Klient si drží `resolved` (klíče řádků odbavených v téhle
relaci) **mimo** `decisions`: není to rozhodnutí do snapshotu, příští sync tu
změnu díky srovnané baseline stejně nenajde. Chybový diff z ADO ho vyprázdní —
akce neproběhla, takže změna pořád platí.

### Popis se porovnává jako text

Plánovač drží markdown, ADO HTML, a `markdownToHtml ∘ htmlToMarkdown` není
identita: prázdné řádky mezi odstavci zmizí, `1.` se vrátí jako `-`. Porovnání
tvaru proto hlásilo rozdíl u popisů, které se liší jen tím, čím prošly — i hned
po tom, co je uživatel sám sesynchronizoval. `AdoMarkdown.descriptionText`
zredukuje obě strany na holý text (bez značek, bez rozdílů v bílých znacích) a
teprve ten se porovnává.

Při psaní testu na tohle vypadla ještě jedna vada, kterou samotné porovnání
textu nespraví: `htmlToMarkdown` řádek jen **ukončoval**, neotevíral. `</li>`
po sobě konec řádku nenechává (o odsazení dalšího bodu se stará `<li>`), takže
první blok za seznamem se přilepil na poslední odrážku — `druhý bod1. krok`.
Slepená slova se liší i jako text, a hlavně to takhle uživatel viděl v náhledu.
Otevírací blokové značky proto nově začínají řádek.

Cena je vědomá: rozdíl **jen** ve formátování se nehlásí. Za to jsou hlášené
rozdíly skutečné, což je u seznamu, který se odklikává, důležitější.

### Stav PATu si klient musí vyžádat

`patSet`/`patUpdatedAt` jsou per-user, takže nejsou v `AppState` a nepřijdou
s `full_state`. Klient je znal jen jako odpověď na vlastní uložení PATu — po
reloadu tedy tvrdil „PAT není nastaven" a **zakázal synchronizaci** nad plně
funkčním nastavením. Command `ado_request_status` vrací `ado_pat_saved`
odesílateli; view se ptá při vstupu na záložku a po návratu online. PAT
samotný se tím ke klientovi nedostane — vrací se jen příznak a čas.
