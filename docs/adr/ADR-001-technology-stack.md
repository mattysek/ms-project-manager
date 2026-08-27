# ADR-001: Technologický stack backendu

## Status
Přijato

## Kontext

MSProjectManager je v současnosti čistě klientská aplikace (React SPA + IndexedDB). Pro přechod na multi-user kolaborativní nástroj je nutné zavést serverovou vrstvu. Tým má zkušenosti primárně s .NET (F#, C#) a TypeScript. Aplikace bude hostována jako Windows Service na Windows VM. Maximální počet uživatelů je 15.

Požadavky na backend:
- Real-time synchronizace stavu mezi uživateli
- Autentizace a autorizace (role per projekt)
- Persistence stavu projektů
- Proxy pro volání Azure DevOps REST API
- Hostování jako Windows Service

## Rozhodnutí

**F# + ASP.NET Core + SignalR + SQLite (WAL) + ASP.NET Core Identity**

- **F#** jako primární jazyk backendu — funkcionální styl přirozeně modeluje immutable state a command-based protokol; `MailboxProcessor<T>` je nativní actor model
- **ASP.NET Core na .NET 10 (LTS)** jako webový framework — nativní Windows Service hosting přes `IHostedService`, middleware pipeline, DI container. Target framework `net10.0`; build běží v `mcr.microsoft.com/dotnet/sdk:10.0` (viz ADR-011)
- **SignalR** pro WebSocket komunikaci — Microsoft-supported, integrovaný s ASP.NET Core, podporuje skupiny (per-projekt broadcast), fallback na long-polling
- **SQLite s WAL módem** jako databáze — zero-configuration, single-file deployment, dostatečný výkon pro 15 uživatelů, WAL umožňuje souběžné čtení
- **ASP.NET Core Identity** pro autentizaci — řeší password hashing (PBKDF2), cookie management, UserManager/SignInManager out-of-box
- **React SPA** (TypeScript) frontend zůstává zachován — pouze se odpojí od IndexedDB a napojí na SignalR

## Alternativy

### Elixir / Phoenix
- **Pro:** GenServer je nativní actor model, Phoenix Channels = SignalR, Phoenix.Presence built-in, OTP supervision tree
- **Proti:** nová platforma pro tým bez Elixir zkušeností, Windows hosting není primární cílová platforma Elixiru, složitější integrace jako Windows Service

### Node.js + xstate
- **Pro:** TypeScript sdílený s frontendem, velký ekosystém
- **Proti:** actor model je bolestně ruční (xstate přidává komplexitu), single-threaded event loop vyžaduje clustering pro výkon, méně elegantní než F# pro tento use case

### Go + goroutines
- **Pro:** výkonný, jednoduchý deployment
- **Proti:** žádný built-in actor model (ruční kanály a mutexy), žádný ekvivalent SignalR, slabší Windows Service tooling

### C# + Akka.NET
- **Pro:** plnohodnotný actor framework, dobré .NET napojení
- **Proti:** Akka.NET je signifikantně složitější než `MailboxProcessor` pro tento rozsah (15 uživatelů), velký overhead v konfiguraci, přináší distributed computing komplexitu kde není potřeba

## Důsledky

**Pozitivní:**
- Tým může použít existující .NET znalosti
- Nativní Windows Service deployment (`sc.exe` nebo NSSM)
- `MailboxProcessor` eliminuje race conditions per-projekt bez nutnosti explicitních zámků
- ASP.NET Core Identity eliminuje nutnost psát vlastní auth infrastrukturu
- SQLite WAL + actor serializace zápisů = žádné write-lock problémy

**Negativní:**
- F# je méně rozšířený než C# — nábor a onboarding nových vývojářů může být náročnější
- SignalR nepodporuje nativně binární diff protokoly — diffy se posílají jako JSON
- SQLite není vhodný pro škálování nad cca 50 souběžných uživatelů — při růstu bude nutná migrace na PostgreSQL

**Neutrální:**
- Frontend React SPA zůstává beze změny architektury, pouze se přepíše persistence a komunikace
- TypeScript typy pro command protokol jsou sdíleny — je vhodné udržovat definice v jednom místě (např. generovat z F# typů nebo udržovat ručně synchronizované)
