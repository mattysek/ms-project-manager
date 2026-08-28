# ADR-016: Trezor hesel šifrovaný na klientovi

## Status
Přijato

## Kontext

Tým si vedle plánu potřebuje odkládat přístupové údaje ke sdíleným systémům — servisní účty, testovací prostředí, technické účty k databázím. Dnes končí v Quick Notes, v chatu nebo ve sdíleném Excelu, tedy v úložišti, které je z principu čitelné pro kohokoli s přístupem k souboru nebo k databázi aplikace.

Aplikace už jedno tajemství ukládá: ADO PAT (ADR-008). Ten je ale šifrovaný **na serveru** přes Data Protection API, protože ho server sám potřebuje použít — volá s ním Azure DevOps. U hesel v trezoru je to naopak: server s nimi nikdy nic nedělá, jen je ukládá. Použít stejný model by znamenalo, že celý obsah trezoru je čitelný pro každého, kdo se dostane k souboru databáze **a** ke složce `keys/` — tedy pro každého, kdo má přístup na ten Windows Server. To je u nástroje, který se instaluje jako služba na firemní stroj a zálohuje se na síťový disk, příliš málo.

Zároveň nejde stavět KeePass. Cílem je „dost dobré" úložiště pro interní nástroj: takové, kde únik zálohy databáze neznamená únik hesel.

## Rozhodnutí

**Obsah trezoru se šifruje a dešifruje výhradně v prohlížeči. Server ukládá jen neprůhledné blobs a heslo k trezoru nikdy nevidí.**

- Uživatel si zvolí **heslo k trezoru**, které je nezávislé na přihlašovacím hesle do aplikace. Neposílá se na server v žádné podobě — ani jako hash.
- Z hesla se odvodí klíč **PBKDF2-HMAC-SHA256, 600 000 iterací**, se solí náhodnou per uživatel (16 B). Počet iterací i sůl jsou uložené u profilu trezoru, takže je lze později zvýšit bez migrace formátu.
- Šifruje se **AES-256-GCM** s náhodným 96bitovým IV pro **každý jednotlivý zápis**. GCM dává zároveň autentizaci — poškozený nebo podvržený blob se pozná při dešifrování.
- Šifruje se **celý záznam** (název, uživatelské jméno, heslo, URL, poznámka) jako jeden JSON. Server tedy nezná ani názvy položek.
- Klíč žije **jen v paměti záložky** jako `CryptoKey` s `extractable: false`. Neukládá se do `localStorage`, `sessionStorage` ani IndexedDB. Reload stránky = zamčený trezor.

### Ověření hesla bez dešifrování všeho

Profil trezoru nese `verifier` — konstantní řetězec zašifrovaný odvozeným klíčem. Odemčení znamená zkusit ho dešifrovat: GCM authentication tag selže při špatném hesle, aniž by se sáhlo na jediný záznam. Bez toho by „špatné heslo" bylo k nerozeznání od „poškozená data" a UI by muselo hádat.

### Schéma

```
vault_profiles   user_id (PK), kdf, iterations, salt, verifier, verifier_iv, created_at, updated_at
vault_entries    id (PK), user_id, ciphertext, iv, created_at, updated_at
```

Časy zůstávají v plaintextu — jsou to metadata, podle kterých se řadí seznam, a jejich zašifrování by znamenalo stáhnout a dešifrovat celý trezor jen kvůli seřazení.

### Proč per-záznam, a ne jeden blob na celý trezor

Jeden blob by byl jednodušší, ale každá změna jediného hesla by přepsala celý trezor. Dva prohlížeče otevřené vedle sebe by si pak tiše přemazaly změny navzájem — a protože server do obsahu nevidí, nemá jak takový konflikt detekovat. Per-záznam je zápis ohraničený na to, co uživatel opravdu změnil.

### Proč REST, a ne command stream

Trezor **nesmí** jít přes `ProjectCommand`/`ProjectDiff` (ADR-004). `AppState` se broadcastuje všem členům projektu při každém `full_state` — trezor je per-user a soukromý, takže by ho actor rozeslal lidem, kterým nepatří. Jde tedy přes REST, stejně jako Quick Notes (PRD-04) a soubory (ADR-010), a nemá s projekty žádnou vazbu.

### Změna hesla k trezoru

Klient dešifruje všechny záznamy starým klíčem, odvodí nový klíč z nové soli a znovu zašifruje. Výsledek se posílá jako **jeden požadavek** `POST /api/vault/rekey`, který server zapíše v jedné transakci. Rekey po částech by při přerušení spojení nechal půlku trezoru pod starým a půlku pod novým klíčem — a protože server nevidí dovnitř, nešlo by to ani zjistit, ani opravit.

## Alternativy

### Šifrování na serveru přes Data Protection API (jako ADR-008 pro PAT)
- **Pro:** konzistentní se stávajícím kódem, žádná krypto v prohlížeči, funguje offline i pro server-side operace
- **Proti:** neřeší tu hrozbu, kvůli které trezor vzniká. Kdo má soubor DB i `keys/`, má hesla. Záloha typicky obsahuje obojí

### Odvození klíče z přihlašovacího hesla do aplikace
- **Pro:** jedno heslo míň k zapamatování
- **Proti:** heslo do aplikace prochází serverem při každém přihlášení, takže by ho server v ten okamžik měl v plaintextu a mohl by klíč odvodit taky. Navíc admin může heslo resetovat (FR-AUTH-05) — po resetu by byl trezor nedešifrovatelný, a to bez varování

### Vlastní zvolený formát místo KeePass `.kdbx`
- **Pro:** kompatibilita s existujícími nástroji, ověřený formát
- **Proti:** `.kdbx` je složitý (Argon2/ChaCha20, XML uvnitř, více verzí formátu) a jeho implementace v prohlížeči je řádově větší kus práce než tři volání WebCrypto. Export do `.kdbx` je smysluplné budoucí rozšíření, ne základ

### Argon2id místo PBKDF2
- **Pro:** odolnější proti útoku GPU/ASIC, dnešní doporučení pro nové systémy
- **Proti:** WebCrypto ho neumí, takže by přišla WASM závislost do bundlu. PBKDF2 se 600 000 iteracemi je v rámci OWASP doporučení a stačí na deklarovaný threat model (offline útok na ukradenou zálohu)

## Důsledky

**Pozitivní:**
- Únik souboru databáze ani zálohy neodhalí hesla — bez hesla uživatele jsou to náhodná data
- Správce serveru, DBA ani nikdo s přístupem k disku nemá do trezoru cestu
- Server nemá odpovědnost, kterou by nezvládl: neloguje, nepřeposílá ani neindexuje nic citlivého

**Negativní:**
- **Zapomenuté heslo znamená ztrátu dat.** Neexistuje reset ani obnova; jediná možnost je trezor smazat a založit znovu. UI to musí říct dopředu, ne až potom
- Trezor nefunguje offline (na rozdíl od Quick Notes) — viz níže
- Hledání a řazení podle názvu se dělá až na klientovi nad dešifrovanými daty, takže server nemůže stránkovat. Pro řádovou velikost (desítky až stovky záznamů na uživatele) to nevadí, limit 500 záznamů to drží

**Co tenhle model NEchrání** (a je poctivé to napsat, protože přesně tady bývá zero-knowledge v prohlížeči přeceňované):
- Aplikaci servíruje ten samý server, který ukládá blobs. Kdo umí měnit servírovaný JavaScript, umí si přidat kód, který heslo odešle. Ochrana míří na **data v klidu** (ukradená DB, záloha, disk), ne na kompromitovaný server
- XSS v aplikaci může číst odemčený trezor z paměti záložky. Proto sanitizace všech cizích textů (`utils/htmlMarkdownConverter.ts`) a CSP platí pro trezor stejně jako pro zbytek
- Sílu ochrany určuje heslo uživatele. Slabé heslo se ubrání jen tolik, kolik unese 600 000 iterací

## Doplněk: offline je mimo rozsah

Quick Notes mají frontu (ADR-009), soubory ne (ADR-010) — a trezor patří ke druhé skupině. Ukládat šifrované blobs do IndexedDB by znamenalo mít je natrvalo na disku každého prohlížeče, kde se kdy trezor otevřel, tedy rozšířit plochu útoku přesně o to, čemu se ADR vyhýbá. Fronta commandů navíc řeší konflikty porovnáním se stavem serveru (`detectConflicts.ts`), což u dat, do kterých server nevidí, nedává smysl. Trezor je proto online-only a při výpadku spojení se tváří jako zamčený.
