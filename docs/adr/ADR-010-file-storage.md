# ADR-010: Ukládání souborů — BLOB v SQLite

## Status
Přijato

## Kontext

Aplikace umožňuje přikládat soubory k projektu (přílohy — dokumenty, obrázky, PDF, Excel soubory). V současné single-user verzi jsou soubory uloženy jako base64 string inline v project JSON v IndexedDB. Pro multi-user verzi je nutné centralizovat ukládání souborů.

Typický use case: málo souborů (do 20 per projekt), malé velikosti (do 10 MB per soubor). Celkový objem dat: desítky MB, ne gigabajty.

## Rozhodnutí

**Soubory ukládány jako BLOB přímo v SQLite v tabulce `files`. Stahování přes REST endpoint `GET /api/files/{id}`.**

```sql
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    data BLOB NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL,
    added_by TEXT NOT NULL REFERENCES AspNetUsers(Id)
);
```

Upload flow:
1. Klient vybere soubor (file picker nebo drag-drop)
2. `POST /api/projects/{projectId}/files` s `multipart/form-data`
3. Server uloží BLOB do SQLite, vrátí `FileRef` (id, name, mimeType, size, addedAt)
4. Server pošle diff `{ op: "file_added", file: FileRef }` přes SignalR všem klientům
5. Klient přidá `FileRef` do lokálního stavu (bez `data` — data jsou jen na serveru)

Download flow:
1. Klient klikne "Stáhnout"
2. `GET /api/files/{id}` s cookie auth
3. Server vrátí stream s `Content-Disposition: attachment; filename="..."`

Preview flow (obrázky, PDF):
1. Klient otevře preview
2. `GET /api/files/{id}` → inline display (ne attachment)
3. Pro Excel (xlsx) a Word (docx) parsing zůstává na klientovi — klient stáhne soubor a parsuje ho lokálně

### Změna v `FileRef` modelu

```typescript
// Dřívější (obsahoval data):
interface FileRef {
  id: string; name: string; data: string; mimeType: string; size: number; addedAt: string; note: string
}

// Nový (data jsou na serveru):
interface FileRef {
  id: string; name: string; mimeType: string; size: number; addedAt: string; addedBy: string; note: string
  // data: string  ← odstraněno
}
```

## Alternativy

### S3 / MinIO object storage
- **Pro:** škáluje na gigabajty/terabajty, CDN-friendly, standardní protokol
- **Proti:** přidává závislost na externím systému (MinIO server nebo AWS účet); komplexní deployment; pro desítky MB je absolutní overengineering; single-file deployment by se komplikoval

### Filesystem (ukládání na disk Windows VM)
- **Pro:** jednoduché, rychlé streaming
- **Proti:** nutnost řešit path sanitizaci (security), backup strategie soubory + DB musí být koordinovány, přístup přes HTTP vyžaduje mapování, při přesunu serveru je nutné přesunout i soubory

### Base64 inline v project JSON (zachování současného stavu)
- **Pro:** nejjednodušší, žádný extra kód
- **Proti:** base64 zvyšuje velikost 1.33×; velké soubory způsobí, že `state_json` v DB je obrovský; broadcastovat celý AppState se soubory přes SignalR je nepřijatelné; SQLite má limit na délku JSON sloupce

### Separate SQLite database pro soubory
- **Pro:** izolace, nezatěžuje hlavní DB transakcemi
- **Proti:** pro tento rozsah zbytečná komplexita; SQLite WAL + actor serializace zápisů = žádné write-lock problémy

## Důsledky

**Pozitivní:**
- Single-file deployment — jeden SQLite soubor obsahuje vše (projekt data + soubory)
- Backup je triviální — zkopírovat jeden `.db` soubor
- Autorizace souborů je konzistentní s projektem — REST endpoint ověřuje cookie + membership
- Žádná závislost na externích systémech

**Negativní:**
- SQLite BLOB performance: pro soubory nad 1 MB je SQLite pomalejší než filesystem streaming; pro typický use case (dokumenty, obrázky do 10 MB) je to přijatelné
- Při růstu počtu/velikosti souborů může SQLite soubor narůst na stovky MB — monitoring a archivace budou potřeba
- SQLite WAL checkpoint může být pomalý při velkých BLOB zápis/čtení transakcích — nutné testovat s reálnými soubory

**Implementační poznámky:**
- SQLite nastavení: `PRAGMA page_size = 65536;` (64KB stránky — optimální pro BLOB)
- Upload size limit: konfigurovatelný, default 25 MB per soubor
- MIME type whitelist: `image/*`, `application/pdf`, `application/vnd.openxmlformats-officedocument.*`, `application/vnd.ms-excel`, `text/plain`, `application/zip`
- Soubory nejsou součástí `state_json` — jsou přistupovány separátně přes REST; `files` v AppState jsou pouze `FileRef[]` (metadata)


---

## Doplněk: záruka je v místě zobrazení, ne ve filtru při nahrávání

**Status:** přijato 2026-08-26

Původní rozhodnutí mělo dvě nezávislé zábrany: whitelist MIME typů při
**nahrávání** a uzavřený seznam typů, které se smějí poslat `inline` při
**stahování**. Text výše navíc varoval, ať se ani jedna „nezjednodušuje".

Provozní data ukázala, že ta první je špatně umístěná. Reálný export projektu
(20 příloh) přišel při importu o polovinu souborů: whitelist odmítl
`text/markdown`, `application/x-zip-compressed`, `application/x-pkcs12`
a všechno s `application/octet-stream` — tedy poznámky, archivy a certifikáty,
běžný obsah projektové dokumentace. Uživatel nedostal projekt, který si
exportoval.

**Rozhodnutí:** nahrát jde libovolný typ (velikostní limity platí dál).
Bezpečnostní hranice se celá přesouvá tam, kde riziko skutečně vzniká.

### Proč to není oslabení

Uložit bajty do BLOBu není zranitelnost. Uložené XSS vzniká až ve chvíli, kdy
se cizí obsah **vykreslí jako HTML na našem originu**. Proti tomu stojí dvě
zábrany, které whitelist při nahrávání nenahrazoval — jen zakrýval:

1. **Servírování.** `inlineSafeMimes` je uzavřený seznam (rastrové obrázky
   a PDF). Cokoli jiného odchází s `Content-Disposition: attachment`
   a `X-Content-Type-Options: nosniff`, i když si klient výslovně řekl
   o `?inline=true`. Stažený soubor se otevírá z `file://`, tedy mimo náš
   origin a bez přístupu k session cookie.
2. **Náhled na klientovi.** XSS není jen otázka hlavičky — stejně tak jde
   o **reflexi**, tedy o každé místo, kde se cizí text dostane do stránky:
   - markdown i Word (`mammoth`) procházejí `sanitizeHtml` (DOMPurify),
   - text a kód se vykreslují jako escapovaný `<pre>`,
   - jméno souboru, poznámka a MIME typ jdou přes JSX, které escapuje samo,
   - SVG se zobrazuje přes `<img>`, kde prohlížeč skripty nespouští.

### Co to znamená pro budoucí změny

Kdo přidá nový typ náhledu, **posouvá bezpečnostní hranici** — a musí ji
ohlídat v místě zobrazení, ne přidáním typu do nějakého seznamu na serveru.
Konkrétně: žádný nový `dangerouslySetInnerHTML` bez `sanitizeHtml`, a rozšíření
`inlineSafeMimes` je samostatné rozhodnutí, ne implementační detail.

Hlídají to `previewSafety.test.ts` (sanitizace a rozřazení náhledů) a serverový
test „skriptovatelný obsah se nikdy nepošle inline".
