# ADR-003: Autentizace — ASP.NET Core Identity + cookie

## Status
Přijato

## Kontext

Aplikace přechází z lokálního single-user nástroje na síťový nástroj pro tým do 15 lidí. Je nutné ověřovat identitu uživatelů a udržovat přihlášenou session. Aplikace je interní (intranet, Windows VM), není veřejně přístupná.

Požadavky:
- Bezpečné uložení hesel (hash + salt)
- Session management (přihlášení přetrvá po reload stránky)
- Žádná veřejná registrace — účty vytváří PM nebo admin
- Jednoduchost: nepoužívat složité OAuth/OIDC pro interní nástroj

## Rozhodnutí

**ASP.NET Core Identity + cookie-based authentication**

- `AddDefaultIdentity<AppUser>()` nakonfigurované s SQLite EF Core providerem
- Cookie authentication (ne JWT) — `AddAuthentication().AddCookie()`
- `AppUser : IdentityUser` rozšířen o `DisplayName : string`
- Hesla hashována PBKDF2 (Identity default) — minimální délka 8 znaků
- Cookie: `HttpOnly = true`, `SameSite = Strict`, expiry konfigurovatelný (default 8 hodin sliding)
- SignalR handshake ověřuje cookie automaticky přes middleware pipeline
- Žádná sessions tabulka v DB — session stav je v cookie, server je stateless co do auth

## Alternativy

### JWT (JSON Web Tokens)
- **Pro:** stateless, vhodné pro SPA a microservices
- **Proti:** nutnost řešit refresh tokeny, token storage na klientovi (localStorage = XSS riziko, cookie = stejné jako cookie auth ale složitější), token invalidace před vypršením vyžaduje denylist v DB — pro interní nástroj zbytečná komplexita

### Vlastní sessions tabulka v DB
- **Pro:** plná kontrola
- **Proti:** znovuvynalézání kola, každý request = DB lookup pro validaci session, Identity to řeší lépe out-of-box

### In-memory session slovník (`ConcurrentDictionary<token, UserId>`)
- **Pro:** nejjednodušší, žádný DB overhead
- **Proti:** sessions se ztratí při restartu Windows Service (uživatelé musí znovu přihlásit), špatně škáluje pokud by se přidalo více instancí

### Windows Authentication (NTLM/Kerberos)
- **Pro:** SSO pro Windows doménu, žádná správa hesel
- **Proti:** vyžaduje Active Directory infrastrukturu, komplikuje cross-platform přístup, více konfigurace

## Důsledky

**Pozitivní:**
- Identity řeší vše: password hashing, account lockout, UserManager API, SignInManager
- Cookie auth funguje nativně se SignalR — žádná extra konfigurace pro WebSocket auth
- EF Core Identity provider automaticky vytvoří `AspNetUsers`, `AspNetRoles` atd. tabulky v SQLite při první migraci
- Session expiry (sliding) zajistí automatické odhlášení při nečinnosti

**Negativní:**
- Cookie funguje dobře pro browser klienty; pokud by se v budoucnu přidával API klient (mobilní app, CLI), bylo by nutné přidat JWT nebo API key auth
- Identity přidává sadu tabulek do SQLite (AspNetUsers, AspNetUserClaims, AspNetUserLogins, AspNetUserTokens, AspNetRoles, AspNetUserRoles, AspNetRoleClaims) — pro tento projekt jsou většina z nich prázdné, ale migrační skript je vygeneruje

**Implementační poznámky:**
- Pro SignalR autorizaci stačí `[Authorize]` atribut na Hub třídě
- `IUserStore` a `IRoleStore` jsou automaticky zaregistrovány EF Core providerem
- Admin (první uživatel v systému) může vytvářet účty ostatních; PM může přidávat uživatele do svých projektů z existujících účtů

---

## Doplněk: bezpečnostní hlavičky a cachování

**Status:** přijato 2026-08-17

ADR-003 řešilo autentizaci, ale ne HTTP hardening okolo ní. Server neposílal
žádné bezpečnostní hlavičky a odpovědi mimo statické soubory neměly ani
`Cache-Control`.

### Rozhodnutí

Dva vlastní middlewary v `Hosting/` místo balíčku třetí strany. Microsoft
žádný NuGet na security headers nedodává (HSTS je vestavěné, zbytek ne);
komunitní `NetEscapades.AspNetCore.SecurityHeaders` je kvalitní, ale sada
hlaviček je u nás statická a middleware má dvacet řádků — závislost navíc
se nevyplatí.

**`SecurityHeaders`** — CSP, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`,
`Cross-Origin-*`. Odstraňuje `Server` a `X-Powered-By`; `Server` navíc vypíná
Kestrel přes `AddServerHeader <- false`.

**`CacheHeaders`** — `Cache-Control` deterministicky na každou odpověď:
`/assets/*` `immutable` na rok, všechno ostatní `no-cache, no-store,
must-revalidate`.

Obojí nastavuje hlavičky v `OnStarting`, ne při vstupu do pipeline — jinak by
je přepsal ten middleware, který odpověď skutečně vyrábí.

### Proč middleware a ne `OnPrepareResponse`

`OnPrepareResponse` u `UseStaticFiles` se **nevztahuje na
`MapFallbackToFile`**, kterým se `index.html` servíruje pro všechny SPA cesty,
ani na minimal API. Právě ty odpovědi chodily bez `Cache-Control` — a odpověď
bez `Cache-Control` si prohlížeč smí zacachovat heuristicky podle
`Last-Modified`. Důsledkem je stará aplikace nebo stará data, aniž by to kdokoli
nakonfiguroval.

### Kde CSP nemůže být přísnější

- `style-src 'unsafe-inline'` — komponenty používají inline `style={{…}}`
  (Gantt bary, barvy kategorií), tedy style **atributy**. Odstranit to znamená
  přepsat je na CSS třídy.
- `frame-src 'self'` — náhled PDF běží v `<iframe>` na vlastní origin.

`script-src 'self'` naopak přísné je: Vite build nemá žádný inline `<script>`.

### Cookie

`HttpOnly`, `SameSite=Strict` a `Secure` (při `Auth:RequireHttps`) platily už
dřív. Nově se při `RequireHttps` zapíná `UseHsts()` a `UseHttpsRedirection()` —
předtím server obsluhoval i HTTP, cookie se nenastavila a uživatel skončil
v nekonečné smyčce přihlášení bez vysvětlení.

Ochrana proti CSRF stojí na `SameSite=Strict`. Stojí za to to vědět, protože
upload příloh je `multipart/form-data`, tedy „simple request", který by šlo
odeslat cross-site formulářem — blokuje to výhradně ten jeden atribut.

### Nasazení

`AllowedHosts` je v repozitáři `"*"`. Při nasazení se nastavuje na hostname VM.
