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
