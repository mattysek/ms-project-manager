# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

```
build/            build.sh, demo.sh (local run), demo-seed.sh + the five gates
deploy/           Windows Service installer + deployment README
docs/             adr/ (15), prd/ (9), features/ (16 .feature files, 306 scenarios)
src/client/       React 18 + TS + Vite. package.json, biome.json, tsconfig, vite/vitest configs
                  live here; sources sit directly alongside them (components/, hooks/, state/, …)
src/server/       F# + ASP.NET Core. slnx, Directory.Build.props, fsharplint.json, .config/ here;
                  four projects (see below)
```

The server is split into four projects, and the split exists for one reason — EF Core can't scaffold F# migrations, but it follows the language of the *migrations* project, not of the one holding the `DbContext` (ADR-013):

```
MSProjectManager.Persistence (F#)   entities, AppDbContext, SQLite pragmas, design-time factory
MSProjectManager.Migrations  (C#)   generated migrations + ModelSnapshot — the only C# in the repo
MSProjectManager.Server      (F#)   everything else; references both
MSProjectManager.Server.Tests(F#)
```

`Persistence` deliberately does **not** depend on `Domain` — the repositories that know `AppState` stay in the server project under `Persistence/Repositories/`. Don't add a Domain reference there or the C# migrations project drags the whole domain along.

Only shared things live at the root: `CLAUDE.md`, `README.md`, `.editorconfig`, `.gitignore`, `build/`, `deploy/`, `docs/`. `deploy/` holds the Windows Service installer (`Install-MSProjectManager.ps1`) and its README; `build.sh publish` copies both into `publish/`. Tool configs belong to the side they configure — **don't hoist them back to the root**. Build output is `src/client/dist/` (gitignored), copied into `src/server/MSProjectManager.Server/wwwroot/`.

## Commands

```bash
./build/demo.sh [--seed]     # run the app locally on http://127.0.0.1:8080 for a browser
                             # --seed fills two projects + an archived one with content
                             # --keep resumes the previous .demo/ database
./build/build.sh web         # containerized frontend build + copy dist/ → server wwwroot
./build/build.sh server      # dotnet build -c Release
./build/build.sh all         # frontend + backend, both in podman
./build/build.sh test        # all four contract gates + Vitest + dotnet test + scenario coverage
./build/build.sh scenarios   # only: does every Gherkin scenario have a test?
./build/build.sh protocol    # only: do the server and client wire protocols agree?
./build/build.sh api         # only: does every REST path the client calls exist on the server?
./build/build.sh hub         # only: do the SignalR method arities match?
./build/build.sh entity      # only: do domain entities have the same required fields on both sides?
./build/build.sh lint        # Biome + FSharpLint
./build/build.sh format      # Biome format + Fantomas (rewrites files)
./build/build.sh migration X # generate EF migration X into the C# migrations project
```

npm scripts (`dev`, `build`, `test:run`, …) run from `src/client/` and need local Node; `build.sh` needs neither Node nor the .NET SDK.

`tsc` runs with `strict`, `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`; the F# side has `TreatWarningsAsErrors` (see `src/server/Directory.Build.props`), which notably makes `FS0025` — a non-exhaustive match over commands — a build error.

**Do not run two of these targets against the tree at once.** Every target mounts the repo into a container and writes to the same `obj/` and `bin/`, so a `dotnet test` overlapping a `format`/`lint` run produces bogus failures — observed as 44 phantom test failures that vanished on a clean serial run.

This bites harder than it sounds, because **a timed-out command leaves its container running**. Several accumulated over days and quietly contended on the same mount, which is what produced the "flaky" failures. When results look catastrophic and unrelated to your change, check `podman ps` first and kill strays before believing anything.

If `dotnet test` hangs after printing `A total of 1 test files matched the specified pattern`, the tests are fine — it stalls on the mount. `build.sh test` therefore runs `dotnet build` first and then `dotnet test … --no-build`.

That helped but did not eliminate it: the hang still shows up with `--no-build`, most reliably on the **first `build.sh test` after an `e2e/run.sh` session**, with `testhost` alive and burning CPU while nothing is printed. `podman kill <container>` and a plain re-run passes every time. Don't start debugging a test on this evidence — kill and re-run first, then believe the result.

**Only `-c Release` builds.** `dotnet build -c Debug` fails on `Realtime/Presence.fs` with `FS3517` (`InlineIfLambda` not resolved to a lambda), because `Directory.Build.props` turns that informational warning into an error and Debug doesn't inline. Everything — `build.sh`, `dotnet ef`, tests — must pass `-c Release`; `dotnet ef` in particular defaults to Debug, so `build.sh migration` passes `--configuration Release` explicitly.

**Biome truncates.** Plain `biome lint` prints only the first 20 diagnostics and silently drops the rest, so any count you read off it is a lower bound, not a total. `build.sh lint` passes `--max-diagnostics=none` for exactly this reason — don't remove it, or the gate starts under-reporting. Lint rules are at `error` (PRD-07 FR-QUAL-07): `noExcessiveLinesPerFunction` (60), `useMaxParams` (4), `noExcessiveCognitiveComplexity` (15), `noNestedTernary`. The line rule is off for `*.test.ts(x)` via `overrides`.

Splitting a file does **not** reduce those findings — the limits apply per function, and nested `.map()` closures inside JSX count as their own functions. `docs/prd/PRD-07-frontend-code-quality.md` records the decomposition pattern that actually works, plus the trap where moving `useState` setters behind a helper hook breaks Biome's stable-identity detection and adds `useExhaustiveDependencies` findings.

### Acceptance criteria are the Gherkin files

`docs/features/*.feature` holds 306 scenarios that define done. A test claims a scenario with a marker comment — same syntax in TypeScript and F#:

```
// @scenario: auth.feature > Úspěšné přihlášení
```

`build/scenario-coverage.mjs` cross-checks markers against the feature files and fails on either a scenario with no test or a marker pointing at a scenario that no longer exists. Scenario names are not unique across files, so the feature filename is part of the key. It scans `src/` **and `e2e/`** — a few scenarios (routing between screens, for instance) have nowhere else to live. The catch: `build.sh test` does not run E2E, so a scenario claimed only from `e2e/` is green in the gate without having been executed by the last `build.sh test`.

### E2E against a real server (`e2e/`)

`./e2e/run.sh [spec] [playwright args]` runs Playwright against a real build: fresh SQLite in `/tmp/e2e`, real SignalR, real Identity. It is **not** part of `build.sh test` — it needs `build.sh web` to have run first, because it serves whatever sits in `wwwroot/`.

This layer exists because the unit suites can't see the seam: the client tests mock the server and the server tests use a .NET client, so both stayed green through bugs that made the app completely unusable in a browser (see the gates above). Every gate in this repo was written after E2E found the bug it now prevents.

The specs are split by what they exercise, not by feature area: `smoke` (auth, headers, caching), `views` (one pass per tab, each ending in a reload so "the server stored it" is distinguishable from "I see my own optimistic change"), `collaboration` (two or three browsers on one hub), `offline` (queue, replay, conflicts), `files` (REST multipart plus the `Content-Disposition` rules from ADR-010) and `roles` (role changes, membership, archiving, undo/redo).

Things that will otherwise cost an hour:

- Server and browser run in one **podman pod** so they share `localhost` — the browser has to reach the server from inside.
- Published ports *do* reach the host, but only over IPv4: pasta binds `*:8080` and does not forward `::1`, so `localhost` (which resolves to `::1` first) fails while `127.0.0.1` works. `build/demo.sh` uses the literal address for that reason.
- **Recreate the pod after a frontend rebuild; don't `podman restart`.** `build.sh web` relabels the mount for SELinux and a running container loses access to it — the symptom is `Permission denied` on files the test never touches.
- The same trap bites any container that mounts the repo with `:Z` **while another one is running against it**. `build/demo-seed.sh` originally mounted the whole repo and relabelled `.demo/` out from under the live demo server; it surfaced as `SQLite Error 15: 'locking protocol'` and a database broken mid-seed, which looks nothing like a permissions problem. Mount only the directory you need.
- The Playwright npm version in `e2e/package.json` must match the image tag in `run.sh` exactly.
- `E2E_LOGS=1` dumps the server log; `E2E_LOG_LEVEL`, `E2E_LOG_LINES` and `E2E_HUB_DETAILED_ERRORS=true` widen it. The last one is what turns "an error on the server" into the actual exception — hub argument-binding failures are otherwise logged nowhere.
- Tabs are CSS-uppercased, so a tab's accessible name doesn't match the source text — `fixtures.ts` keys off "← Projekty" plus the project name instead.
- Several `aria-label`s embed the current value (`Jméno — Petra`, `Název úkolu — …`). They change **while you type**, so an exact-name locator stops matching mid-`fill`. Use a regex (`/^Název úkolu — /`) to find the field and the exact name only to assert the result.
- `TopBar` is `position: fixed`, so it contributes no layout height of its own — the shell reserves `TOP_BAR_HEIGHT` instead. Before that reservation existed, the bar (z-index 4000) sat on top of the project header's right wing and swallowed every click on `⬆ Import` and `⬇ Export`; both buttons were dead at every viewport size and no test had ever clicked them. If you make that bar taller or add controls to it, keep the constant and the reservation in sync.

### The wire protocol has two hand-maintained sides

`ProjectCommand`/`ProjectDiff` live in F# (`src/server/MSProjectManager.Server/Domain/{Commands,Diffs}.fs`) and TypeScript (`src/client/types/protocol.ts`). ADR-004 names the desync risk explicitly, and it is the nastiest kind: a diff the client doesn't recognise is silently dropped, so nothing fails to compile and no test goes red — the user just sees stale data. Three real cases got through this way (`alloc_updated` missing entirely, `milestone_checklist_updated` missing, `file_updated` vs `file_note_updated`).

`./build/build.sh protocol` compares both sides. Wire tags derive from F# case names via snake_case unless `[<JsonName "…">]` overrides them. Tags the client legitimately never sends live in `SERVER_INTERNAL`; tags still awaiting client migration live in `PENDING` — and the check fails if a `PENDING` entry becomes stale, so the list can't quietly rot into a permanent excuse.

**Three more seams desync the same silent way**, so each got its own gate. All four run inside `build.sh test`, and every one of them exists because the corresponding bug reached a browser while the whole unit suite stayed green — each side was mocked, so each side agreed with itself:

- `api` (`build/api-contract.mjs`) — REST paths in `src/client/api/*.ts` vs `MapGet`/`MapPost`/… in `Hosting/Endpoints.fs`. The client called `/projects` while the server maps `/api/projects`, so the landing page fell through to the SPA fallback and `response.json()` threw into a swallowed `alert`.
- `hub` (`build/hub-contract.mjs`) — argument counts of `invoke(HUB_METHODS.x, …)` vs `member this.X(…)` in `ProjectHub.fs`. **SignalR binds arguments by count**, so a missing `projectId` made every single command fail with `InvalidDataException`.
- `entity` (`build/entity-contract.mjs`) — required fields of the records in `Domain/Types.fs` vs the interfaces in `src/client/types/index.ts`. The protocol gate only checks the message *tag*; the entity inside it went unchecked. `Person.UserId` was a plain `string | null` on the server but `userId?` on the client, which never sent it — `add_person` failed argument binding and Kapacita couldn't add anyone.

The rule the entity gate enforces: **a field that isn't `option` on the F# side must not be optional (`?`) on the TS side.** `FSharp.SystemTextJson` tolerates a missing `option` field (that's why partial `*Fields` patch records work), but a missing plain field is a hard binding error. Record fields go on the wire in camelCase — only union *tags* are snake_case.

The mirror-image rule is just as sharp and no gate covers it: **`None` is written as an absent field, never as `null`.** `Protocol/Json.fs` sets `WithSkippableOptionFields()`, so an explicit `"adoConfig": null` is *invalid* input, not an empty value. That broke `full_state_import` for every project without ADO configured — i.e. almost all of them — because the client's `AppState.adoConfig` is `ADOConfig | null` and got serialized as-is. `state/appState.ts` exports `forImportCommand` for exactly this, and both import paths (open project, deferred import from LandingPage) go through it.

Builds run **in podman containers** so neither Node nor the .NET SDK has to be installed locally; dependencies live in named volumes outside the repo. The build emits `index.html` + hashed `assets/`, served by ASP.NET Core with `immutable` cache headers on assets and `no-cache` on `index.html`. See `docs/adr/ADR-011-frontend-build-deployment.md` — `vite-plugin-singlefile` was removed, so the app no longer runs by opening a file; it needs the server.

## Project skills

`.claude/skills/` contains repo-specific workflows (in Czech). Follow them when applicable:
- `/build` — run the build and diagnose failures.
- `/new-entity <Name>` — the full checklist for adding a data type.
- `/new-view <Name>` — add a tab/view (component, `views/index.ts`, `TABS`, `ViewType`, routing).

## Architecture

Multi-user collaborative planner for a team of up to 15, self-hosted as a Windows Service. F# + ASP.NET Core (.NET 10) + SignalR + SQLite (WAL) + ASP.NET Core Identity on the server; React 18 + TypeScript + Vite on the client. **All user-facing text and most identifiers/comments are Czech** — match that when editing UI.

Read `docs/prd/PRD-00-system-overview.md` → the relevant ADR → the relevant PRD → the matching `.feature` before starting. **ADRs are binding: announce a deviation before implementing something different.**

### Server owns the state (ADR-002, ADR-004)

One `MailboxProcessor` actor per project (`Actors/ProjectActor.fs`), registered in `ProjectActorRegistry` (an `IHostedService`). Clients never write state directly — they send a `ProjectCommand` over SignalR; the actor validates authorization, applies a pure reducer (`Domain/Reducers/`), persists, and broadcasts `ProjectDiff`s.

- Commands form a two-level DU (group wrappers `TaskCmd`/`AdoCmd`/…) with a **flat** wire format — that keeps `cyclomaticComplexity` under the FSharpLint limit without changing the protocol.
- Serialization is `FSharp.SystemTextJson` with `InternalTag ||| NamedFields` + `SnakeCaseLower`, producing `{"type":"add_task",…}` / `{"op":"task_added",…}`.
- Not every diff is broadcast: todo/reminder/`role_changed`/`error`/`ado_sync_progress` go back to the **sender only**. The routing table is in the ADR-004 addendum.
- Undo/redo is rejected server-side; the client inverts the command and sends the inverse (`state/invertCommand.ts`).

### Client applies optimistically and rolls back

`useProjectChannel` (`src/client/hooks/`) owns the SignalR connection, `state`, `presence` and `connectionStatus`. `sendCommand` applies the caller's optimistic mutation immediately and restores `lastConfirmedState` if the server rejects it. Presence lives **outside** `AppState` on purpose.

`App.tsx` is 9 lines; `AuthenticatedApp` composes routing, session and commands. Views under `src/client/components/views/` are presentational and receive slices + command setters as props — no context, no external store. Each large view is decomposed into its own folder (`views/gantt/`, `views/ado/`, …) with `use*` hooks for logic and small components for JSX; the top-level file just composes.

Derived data (`weeks`, `monthGroups`, `lanes`, totals, progress) is computed with `useMemo` — never stored.

### Persistence

Server: EF Core + SQLite (WAL, `synchronous=NORMAL`, `page_size=65536`) + ASP.NET Core Identity, cookie auth (8h sliding, HttpOnly, SameSite=Strict, lockout 5/15min).

Migrations are generated normally (`build.sh migration <Name>`), they just live in the C# project — see the ADR-013 addendum. Two things follow:

- `MigrationsAssembly` must be set wherever a `DbContext` is built by hand, or `Migrate()` silently creates **nothing** and you get `no such table: AspNetUsers`. It's set in `Services.register`, `DesignTime.AppDbContextFactory` and `PersistenceTests.createDatabase`.
- The `PersistenceTests` schema test stays mandatory even though `ModelSnapshot` now exists — the snapshot only proves the migration matched the model at generation time.

Writable paths (`Hosting/Options.fs`) resolve relative config values against **`ContentRootPath`, never the process CWD** — a Windows Service starts with CWD in `C:\Windows\System32`. Defaults: `data/msprojectmanager.db` and `keys/` next to the service. The `keys/` folder is the Data Protection key ring that encrypts ADO PATs; losing it makes every stored PAT undecryptable, so it belongs in the backup (ADR-008 addendum).

`Hosting/SecurityHeaders.fs` and `Hosting/CacheHeaders.fs` set their headers in `OnStarting`, not on the way in — otherwise whichever middleware actually produces the response overwrites them. `CacheHeaders` exists as middleware rather than `OnPrepareResponse` because the latter doesn't cover `MapFallbackToFile` or minimal API, which is exactly where responses were going out with no `Cache-Control` at all (ADR-003 addendum).

Client IndexedDB is **only** an offline cache (ADR-009), not the source of truth:
- `storage/offlineQueue.ts` — `pending_commands`, max 500, 48h expiry
- `storage/noteQueue.ts` — `pending_notes`. Quick Notes go over REST, not SignalR, so they can't ride the command queue; this is their equivalent. **Both modules open the same database and must declare the same `DB_VERSION` and create both stores** in `onupgradeneeded` — whichever opens first runs the upgrade.
- `storage/projectCache.ts` — last known state, seeds the UI before `full_state` arrives
- `storage/projectStorage.ts` — project list for the landing page

`detectConflicts.ts` compares the queue against the server state on reconnect. Three things about that comparison are load-bearing and were each a real bug:

- **Replay has two triggers, not one.** `isOffline` is an OR of `navigator.onLine` and the SignalR status, so a browser-level blip (sleeping laptop, Wi-Fi switch) can flip the app into offline mode without the hub connection ever noticing. No reconnect then means no `full_state`, so a replay keyed only on `fullStateVersion` never fires: the queue sits there while the banner disappears, and the user believes the change went out. The second trigger fires on the offline→online edge and calls `channel.requestFullState()` — it deliberately does *not* replay directly, because the baseline has to be the authoritative server state or a concurrent edit made during the outage goes undetected and gets silently overwritten.
- **The baseline is `getLastConfirmedState()`, never `channel.state`.** Offline commands go in through `applyLocal`, so the displayed state already contains them; comparing against it makes every offline change conflict with itself.
- **Replay must not run twice concurrently.** With two triggers this is cheap insurance rather than a diagnosed bug: two runs over the same queue could send a command as conflict-free while the other is still offering it in the conflict dialog. `useReplayRunner` holds the guard.

Resolving a conflict is a write to IndexedDB, and the "✓ Synchronizováno" message is what confirms it landed. Anything that kills the page before that — a reload, closing the tab — leaves the command in the queue, and the next session replays it against a baseline seeded from `project_cache`, so a change the user explicitly discarded can still reach the server. E2E must therefore wait for that message before reloading; it is a real synchronization point, not a cosmetic one.

The pending counter in the banner refreshes on `onQueued` from `useCommandDispatch`. `usePendingQueue` otherwise reads the queue only on mount and after a reconnect, so without that callback the count sat at zero for the whole offline session.

**`offline.feature` has one scenario that is currently unimplementable**: "Pending commandy přežijí reload stránky při offline". Without a service worker the app shell itself won't load offline (`ERR_INTERNET_DISCONNECTED`), so there is nothing to restore into. The queue's persistence is covered by `storage/offlineQueue` unit tests instead.

**Importing an old export is a migration boundary, and no gate covers it.** `build.sh entity` checks that client and server agree *today*; it cannot know that a file exported months ago predates a field. `Person.userId` became required with roles (ADR-006), so older exports lack it — and a missing non-`option` field is a hard binding error, meaning the server rejected the *whole* `full_state_import` and the project came out empty, silently. `utils/importExport.ts` (`personFromImport`) is where older shapes get brought up to date; add to it when a required field appears.

**Two size limits sit on the import path**, both discovered on a real 9.6 MB export:
- The parsed result is handed from LandingPage to the opened project through `state/pendingImport.ts`, **in memory**. It used to go through `sessionStorage`, which caps around 5 MB — base64 attachments blew past it and the import died on `exceeded the quota` after the empty project had already been created. Only the file-less text part is mirrored to `sessionStorage`, best-effort, so a reload mid-import still recovers something.
- SignalR's default `MaximumReceiveMessageSize` is **32 kB** and `full_state_import` is one command by design (ADR-005) — a real project's state is far bigger. `Hub:MaxMessageSizeBytes` raises it (default 4 MB). Over the limit SignalR kills the connection, so the symptom is a dropped socket, not a rejected command.

Quick Notes get their **id from the client** (`CreateNoteRequest.Id`), which is what makes offline editing possible at all: a note created offline can be edited and deleted before its `create` ever reaches the server. Replay is therefore idempotent — `POST /api/quick-notes` with an existing id returns the existing note instead of failing. File uploads stay online-only on purpose (25 MB of binary doesn't belong in a queue next to project state).

### Files and ADO are deliberately not in the command stream

- **KB history** (`kb_page_revisions`) is written by the actor *before* each `update_kb_page`/`delete_kb_page`, through the `ProjectStore.ArchiveKbPage` port — deliberately **outside** `AppState`, because state is broadcast on every `full_state` while revisions are read only on demand. Restoring a revision is not an endpoint: the client sends an ordinary `update_kb_page`, so it goes through the same authorization, diffs and offline queue, and becomes a revision itself.
- **Files** (ADR-010) upload/download over REST multipart and live as SQLite BLOBs; commands carry only `FileRef` metadata. `add_file`/`delete_file` are server-internal — that's why they sit in `SERVER_INTERNAL` in the protocol gate.
  **Upload accepts any MIME type; the security boundary is entirely on the display side** (ADR-010 addendum). The old upload whitelist rejected `text/markdown`, archives, `.pfx` and `application/octet-stream` — half of a real project's attachments — while adding nothing: storing bytes is not a vulnerability, rendering them as HTML on our origin is. Two guards carry that, and both must hold:
  - Serving: `?inline=true` is honoured **only** for `inlineSafeMimes` (raster images + PDF); everything else goes out as `attachment` plus `nosniff`, so it opens from `file://`, off our origin and without the cookie.
  - Preview: markdown and Word (mammoth) go through `sanitizeHtml`; text and code render as an escaped `<pre>`; file name, note and MIME go through JSX, which escapes on its own; SVG renders via `<img>`, where browsers do not execute scripts.

  XSS here is as much about **reflection** as about `Content-Disposition` — every place foreign text reaches the page counts. A new preview type moves this boundary and has to be handled there, not by adding a MIME to a list. `previewSafety.test.ts` and the server test "skriptovatelný obsah se nikdy nepošle inline" guard it.
- **Azure DevOps** (ADR-008): the PAT is encrypted with the Data Protection API (purpose `"ado-pat"`) and **never leaves the server**. All ADO calls go through the server proxy (`Integration/AdoBridge*.fs`); the client only renders the diff UI (`views/ado/`).

### Demo seed

`build/demo-seed.mjs` fills a running instance through the **public interface**: accounts and projects over REST, project content over SignalR as a real hub client, attachments over REST multipart. Writing `state_json` directly would bypass the reducer and authorization, and worse, would diverge from the actor that holds the state in memory (ADR-002) — the seed would appear to work and its data would vanish on the first real command.

It runs in a Node container because `@microsoft/signalr` is a client dependency; the `node_modules` volume mounts **next to the script** (`/seed/node_modules`), since ESM resolves packages from the file's location, not the working directory.

### Gantt drag

The row under the cursor is found with `document.elementFromPoint` against `[data-person-id]`, **not** by computing geometry. The previous version started from a guessed header height (`headerOffset = 70`) and added its own copy of `PersonRow`'s row-height formula; both were wrong often enough that dropping onto another person worked sometimes and not others, and vertical scroll was not accounted for at all. The dragged bar gets `pointer-events: none` while dragging, or it shadows the row underneath it. jsdom has no layout and no `elementFromPoint` (`test/setup.ts` stubs it to `null`), so cross-row dropping is only testable in E2E — `gantt.spec.ts`.

Highlighting the drop target uses `dragPreview.p` (where it will land), not the dragged task's current `p`. Those two are the same only while moving within one row, which is why the bug looked like "the highlight works sometimes".

**Whether a mouseup is a click or a drop is decided in `onMouseUp`, not by the browser's `click` event.** The dragged bar has `pointer-events: none`, so mouseup hit-tests to the row, not the button, and no `click` is fired at all — that regression silently killed "click a bar to open its detail". `GanttBar`'s `onClick` now only serves keyboard activation, recognised by `event.detail === 0`. And "did it move" is decided by comparing the preview against the task, not by the preview's existence: `computeMovePreview` produces one on every mousemove, so a few pixels of tremor during a click would otherwise swallow the detail.

Note the unit-test trap this came from: `fireEvent.click` sets `detail: 0`, i.e. it exercises the *keyboard* path. A test written that way stays green while the mouse path is broken — drive `mouseDown`/`mouseUp` instead.

The bar itself has the same problem for the same reason: `lanes` groups by the **committed** `task.p`, so a task dragged to another person stayed drawn in the source row while the target lit up. `PersonRow` therefore draws a ghost bar in the target row (`ghostFor`) and hides — with `visibility`, not by removing — the original. Hiding rather than removing is load-bearing: dropping the bar out of the source row would shrink it, shift every row below, and change what sits under the cursor, so the drag would oscillate. The ghost keeps the dragged task's `lane` for the same reason.

### Cross-project reads (ADR-015)

`GET /api/me/workload` and the deactivation check are the only places that read more than one project. They go through `Projects.listWithStateForUser`, i.e. **straight at `state_json`, deliberately bypassing the actors** — `registry.Get` would wake an actor per project and hold it for `IdleTimeout` to answer a read-only query. The price is staleness: actors persist on a tick (`PersistInterval`, 5 s), so the projection can lag by that much. It is not hidden — the response carries `staleAfterSeconds`, the screen prints it, and there is a manual refresh button. Nothing writes through this path, which is what makes it safe.

The server converts week numbers to real dates here (`Weeks.weekStartIso`), because `Task.S`/`E` index into *their own* project's timeline (ADR-014) and every consumer would otherwise redo that conversion its own way.

### Roles (ADR-006)

PM / Dev / Viewer, enforced server-side in the actor; `PermissionGate` on the client is UX only. "Own" means `person.userId = ctx.userId` — **never** `person.id`. Task ownership is derived via `Task.p → Person.userId`.

The link itself is set in Kapacita, per person row ("Účet", PM only, FR-ROLE-07); it offers **project members**, refetched on every entry to the tab, because the normal order is add member first, create their person second. Two rules sit on it: the reducer rejects giving one account to a second person in the same project (`ownsTask` would then hold for both), and `removeMember` clears the link through the actor — otherwise returning that account later silently re-inherits rights to tasks it knows nothing about. **This was missing for the whole life of the feature and made the Dev role read-only in practice** (ADR-006, doplněk o mapování): every test asserted the *prohibition*, which worked; nothing asserted that "this is mine" was reachable at all. For any "X may only touch their own" rule, write the mirror test that first gets into the owning state.

Two invariants that are easy to break from the outside:
- **A project must always have a reachable PM.** Removing a member and demoting a role both check it; so does *account deactivation* (`Members.projectsWhereSolePm`) — without that check an admin could strand a project, since Admin has no project-level rights.
- **`role_changed` is produced by the REST layer**, not the actor, and is addressed to the **affected** user (ADR-004). It stays in `senderOnlyCases` purely as a safety net so it can never be broadcast to the group by accident.

Projects are **archived**, not deleted: `DELETE /api/projects/{id}` refuses anything that isn't archived first. Deletion cascades to tasks, files and KB and can't be undone, so it deliberately isn't reachable in one click.

An archived project is **read-only, not just filtered out of the list** — it used to be openable and fully editable because nothing checked `ArchivedAt`. The flag is cached next to the role in `MembershipCache` (it's read per command, archiving happens once per project), and `setArchived` must call `InvalidateProject` or a freshly archived project stays writable and a restored one stays locked. `ProjectHub` blocks every command except `update_presence` — presence is who's looking, not project content, and without the exception the archive would lose everyone's avatars. Attachments go over REST, so `FilesApi` checks the same flag separately on upload and delete.

**Server rejections are shown to the user by `RejectedCommandBanner`.** `ErrorOccurred` was always handled — roll back to `lastConfirmedState`, store it in `lastError` — but nothing ever rendered `lastError`, so a refused change just silently reverted and the reason (which only the server knows) never surfaced. `ProjectChannelError.source` splits the two cases: `server` is shown, `transport` is not, because that one is SignalR's raw English "Cannot send data if the connection is not in the 'Connected' State" and the connection state is already in the header and the offline queue.

### Domain model notes (`src/client/types/index.ts`)

- `Task` uses short field names: `p` (person id), `s`/`e` (start/end **week index**, not dates), `md` (man-days), `cat` (category key). Categories and roles are keyed records, not arrays.
- `Task.updatedBy`/`updatedAt` are stamped by the **reducer**, never by the client — that's also why `applyCommand` takes `now` as a parameter instead of reading the clock, so reducer tests can compare whole states.
- Capacity is `workdays × allocation`, and `workdays` already accounts for Czech public holidays. `useWeeklyLoad` spreads each task's MD across its weeks **proportionally to workdays** for the same reason — a holiday-shortened week must not be handed a full week's work.
- The timeline is week-based: `computeWeeks` (`utils/weeks.ts`) builds `Week[]` from project start/end dates, accounting for Czech public holidays and workdays (`utils/dates.ts`). `Milestone.weekIndex` and task `s`/`e` point into that array, so changing project dates re-clamps tasks and re-sizes `weekAlloc`.
- **The two point into it differently, and ADR-014 is the only place that says so: `Task.s`/`e` are 1-based, `Milestone.weekIndex` is 0-based.** Both conventions are already in stored `state_json` and in exports, so unifying them would mean migrating data for cosmetics. Reading `s`/`e` as an array index is not a style slip — it produced two user-visible bugs (Kapacita flagged overload one week late and lost the final week entirely; every date save pulled last-week tasks back by one and persisted it). Neither was caught, because each side's unit test shared its own side's wrong assumption — `useWeeklyLoad.test.ts` carried the comment "Úkol na jeden týden (W5)" above `s: 4, e: 4`. There is no gate for this; the scenarios `kapacita.feature > Přetížení sedí na stejném týdnu jako v Ganttu` and `project-management.feature > Úkol v posledním týdnu přežije uložení datumů projektu` are what fails on an off-by-one.
- Dates are handled as **local** midnight via `parseLocalDate`/`toISO` — do not use `new Date(iso)` (UTC) for these.
- All markdown/HTML goes through the single sanitized path in `utils/htmlMarkdownConverter.ts` (DOMPurify), including the mammoth docx import. In a multi-user app an unsanitized `dangerouslySetInnerHTML` is stored XSS.
- **Shared CSS classes live in one place: `components/AppStyles.tsx`.** The app has no CSS files — classes come from a `<style>` block rendered by a component. That block used to be copy-pasted into each page, so a new screen that forgot it got unstyled `.btn` buttons (that is exactly what happened to "Moje práce"), and `.markdown-content` was defined inside `TaskDetailModal` while KB and project notes used the same class. Any page that renders `className="btn"`/`"inp"`/`"markdown-content"` must render `<AppStyles />`.
- **`z-index` values come from `constants/layers.ts`, they are not invented per component.** The ad-hoc numbers (1000, 2000, 4000, 5000, 9999) meant `TopBar` at 4000 covered four full-screen overlays at 1000–2000 — and their controls sit at the top, exactly where the bar is. Same failure as the bar swallowing "⬆ Import"/"⬇ Export".

### Barrels

`src/client/utils/index.ts` re-exports only `dates`, `weeks`, `helpers`. `htmlMarkdownConverter` and `importExport` are imported by direct path.

### Server layering

Folders map onto ports and adapters, even though nothing is named that way:

```
Common/        generic helpers, no domain knowledge
Domain/        pure core — types, commands, diffs, reducers, authorization
Protocol/      wire serialization (System.Text.Json) — an adapter, not domain
Actors/        application layer; ProjectStore and AdoGateway are the ports
Persistence/, Integration/   driven adapters
Api/, Realtime/              driving adapters
Hosting/       composition root
```

Two accepted compromises, so nobody "fixes" them by surprise:

- Domain types carry wire attributes (`[<JsonName "pm">]`, `[<JsonFSharpConverter>]`). A separate DTO layer would be purer but would double the maintenance surface of the exact seam ADR-004 already calls the riskiest one.
- The model is a reducer over a whole `AppState`, not DDD aggregates. That's ADR-002 talking; adding aggregates/repositories would fight the actor, not help it.

### Test host gotcha

`WebApplicationFactory<T>` locates the entry point via `typeof<T>.Assembly`. `T` must therefore be a type from **`MSProjectManager.Server`** (`TestHost` uses `AuthOptions`). Point it at something from `.Persistence` and the factory silently builds a host without our `Program`, so no migrations run and ~65 tests fail with `no such table`.
