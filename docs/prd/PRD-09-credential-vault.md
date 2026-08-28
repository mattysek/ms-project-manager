# PRD-09: Trezor hesel

## Přehled

Osobní trezor přístupových údajů, dostupný ze stejné lišty jako Quick Notes a nezávislý na projektech. Uživatel si zvolí heslo k trezoru; obsah se šifruje v prohlížeči a na server jde už jen jako neprůhledný blob (ADR-016).

Cílem není nahradit KeePass ani 1Password. Cílem je, aby servisní hesla nemusela končit v poznámce, v chatu nebo ve sdíleném Excelu.

## Cíle

- Bezpečně odložit přihlašovací údaje ke sdíleným systémům, aniž by je viděl server nebo správce
- Rychle najít a zkopírovat heslo, když je potřeba (bez opisování z obrazovky)
- Únik zálohy databáze nesmí znamenat únik hesel

## Non-goals

- Sdílení hesel mezi uživateli nebo v rámci projektu (trezor je čistě osobní)
- Import/export `.kdbx`, integrace s prohlížečovým správcem hesel, autofill
- Obnova zapomenutého hesla k trezoru — z principu není možná (ADR-016)
- Offline režim (trezor je online-only, viz ADR-016 doplněk)
- Sdílení jednoho trezoru mezi více účty téhož člověka

## Uživatelé a role

Trezor nemá projektové role. Každý přihlášený uživatel má právě jeden vlastní trezor a k cizímu se nedostane — vlastnictví se ověřuje na serveru u každé operace, cizí záznam se tváří jako neexistující (stejné pravidlo jako Quick Notes, FR-QN-08).

## Funkcionální požadavky

### FR-VAULT-01: Založení trezoru
- Při prvním otevření trezoru je uživatel vyzván ke zvolení hesla k trezoru
- Formulář: Heslo, Potvrzení hesla; obě pole se musí shodovat
- Minimální délka hesla k trezoru je **12 znaků** (víc než u přihlášení — na tohle heslo neplatí lockout, útočník s ukradenou zálohou má neomezeně pokusů)
- Formulář **výslovně a před založením** upozorní, že zapomenuté heslo znamená nenávratnou ztrátu obsahu a že ho nelze resetovat
- Heslo k trezoru je nezávislé na přihlašovacím hesle; shoda s ním se nevyžaduje ani nekontroluje

### FR-VAULT-02: Odemčení
- Existující trezor je po otevření zamčený a žádá heslo
- Špatné heslo zobrazí "Nesprávné heslo k trezoru" a nic neprozradí o obsahu
- Odemčení nesmí vyžadovat stažení a dešifrování všech záznamů (ověřuje se proti `verifier`, ADR-016)

### FR-VAULT-03: Zamčení
- Tlačítko "Zamknout" zamkne trezor okamžitě
- Trezor se zamkne sám po **15 minutách nečinnosti** v trezoru
- Trezor se zamkne při odhlášení a při reloadu stránky (klíč žije jen v paměti)
- Po zamčení nesmí zůstat dešifrovaný obsah v paměti komponent

### FR-VAULT-04: Přidání záznamu
- Pole: **Název** (povinný), Uživatelské jméno, Heslo, URL, Poznámka
- Všechna pole včetně názvu se ukládají zašifrovaná
- Limit 500 záznamů na uživatele (stejný řád jako Quick Notes)

### FR-VAULT-05: Úprava a smazání
- Záznam lze upravit i smazat; smazání je bez koše, po potvrzení
- Úprava přepíše jen ten jeden záznam, ne celý trezor

### FR-VAULT-06: Zobrazení a kopírování hesla
- Heslo je ve výpisu i v detailu **maskované**; zobrazí se až na vyžádání ("👁 Zobrazit")
- Tlačítko "Kopírovat" vloží heslo do schránky bez jeho zobrazení
- Schránka se po **30 sekundách** automaticky vyprázdní, pokud v ní zkopírované heslo pořád je
- Kopírování ani zobrazení se nikde neloguje

### FR-VAULT-07: Hledání
- Filtrování podle názvu, uživatelského jména a URL
- Hledá se **na klientovi** nad dešifrovanými daty; na server nejde nic z hledaného výrazu

### FR-VAULT-08: Generátor hesel
- Ve formuláři záznamu je generátor: délka (výchozí 20), velká/malá písmena, číslice, symboly
- Generuje se z `crypto.getRandomValues`, nikdy z `Math.random`

### FR-VAULT-09: Změna hesla k trezoru
- Uživatel zadá stávající a nové heslo
- Všechny záznamy se znovu zašifrují na klientovi a uloží **jedním atomickým požadavkem** (ADR-016)
- Při selhání zůstává trezor beze změny pod původním heslem

### FR-VAULT-10: Zrušení trezoru
- Uživatel může trezor smazat i **bez znalosti hesla** — je to jediné východisko ze zapomenutého hesla
- Smazání vyžaduje potvrzení opsáním slova "SMAZAT" a odstraní profil i všechny záznamy
- Text potvrzení říká, že obsah je nenávratně ztracen

### FR-VAULT-11: Izolace uživatelů
- Server u každé operace ověřuje vlastníka podle přihlášeného účtu
- Cizí záznam vrací 404, ne 403 — existence cizích dat se nepotvrzuje
- Deaktivace účtu (FR-AUTH-05) trezor nemaže; smazání účtu ho odstraní kaskádou

## Non-funkcionální požadavky

- PBKDF2-HMAC-SHA256, **600 000 iterací**, sůl 16 B náhodná per uživatel; počet iterací je uložen u profilu, aby šel zvýšit
- AES-256-GCM, náhodné 96bitové IV pro **každý** zápis (IV se nikdy neopakuje)
- Odvozený klíč je `CryptoKey` s `extractable: false`, drží se pouze v paměti záložky
- Heslo k trezoru ani odvozený klíč nesmí opustit prohlížeč, být zapsán do úložiště ani odeslán v žádném požadavku
- Server o obsahu neví nic: neloguje blobs, nevrací je nikomu jinému než vlastníkovi a nemá způsob, jak je dešifrovat
- Maximální velikost jednoho zašifrovaného záznamu 8 kB (chrání před tím, aby se z trezoru stalo úložiště souborů)

## Uživatelské rozhraní

Tlačítko **"🔐 Trezor"** v horní liště vedle "📝 Poznámky" (`TopBar`), dostupné na LandingPage i uvnitř projektu — stejně jako Quick Notes (FR-QN-01). Otevírá panel s:

- zamčeným stavem (formulář hesla) nebo odemčeným seznamem záznamů,
- polem hledání a tlačítkem "+ Nový záznam",
- seznamem: název, uživatelské jméno, akce (kopírovat, zobrazit, upravit, smazat),
- formulářem záznamu s generátorem hesel,
- v patičce "Zamknout", "Změnit heslo trezoru" a "Zrušit trezor".

Rám panelu (poloha, šířka, orámování, hlavička) je sdílený s Quick Notes — jedna komponenta `FloatingPanel`, aby se ty dvě obrazovky nemohly vizuálně rozejít. Panel používá úroveň `LAYERS.floatingPanel` a třídy z `AppStyles` (`.btn`, `.inp`, `.auth-label`) jako zbytek aplikace.

**Otevřený je vždy jen jeden panel** — trezor, nebo poznámky (FR-QN-01). Zavření panelu trezor **nezamyká**: o klíč se stará automatický zámek (FR-VAULT-03), takže letmý pohled do poznámek nestojí znovuzadání hesla.

## Out of scope

- Sdílené týmové trezory
- TOTP kódy / 2FA generátor
- Historie změn záznamu a koš
- Příznak síly hesla a upozornění na prošlá hesla
- Hardware klíče (WebAuthn) jako alternativa hesla k trezoru
