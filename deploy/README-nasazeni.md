# Nasazení na Windows Server

## Rychlá verze

Na vývojovém stroji:

```bash
./build/build.sh test        # nic se nenasazuje, dokud tohle neprojde
./build/build.sh publish     # → publish/
```

Složku `publish/` přenést na server a tam z ní spustit **jako správce**:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-MSProjectManager.ps1 `
    -Hostname planovac.firma.cz
```

Skript je idempotentní — stejným příkazem se instaluje i aktualizuje.

## Co skript udělá

| Krok | Poznámka |
|---|---|
| Zastaví běžící službu | Počká na flush stavu z paměti na disk |
| Zazálohuje `data` a `keys` | Do `…\MSProjectManager\backup\<timestamp>` |
| Přepíše binárky | `wwwroot` maže celý — názvy assetů jsou hashované |
| Založí zapisovatelné složky | `%ProgramData%\MSProjectManager\{data,keys}` |
| Nastaví ACL | Zápis pro `NETWORK SERVICE`, jen do těch dvou složek |
| Zapíše `appsettings.Production.json` | `AllowedHosts`, cesty, port, HTTPS |
| Založí/aktualizuje službu | Automatický start, restart po pádu |
| Otevře port ve firewallu | Profily Domain a Private, ne Public |
| Ověří, že aplikace odpovídá | Volá skutečný endpoint, ne jen stav služby |

## HTTPS

Bez parametru `-CertificateThumbprint` běží služba na **HTTP** a skript vypne
`Auth:RequireHttps`. Kdyby ho nechal zapnutý, server by přesměrovával na HTTPS,
které nikde neposlouchá — aplikace by byla nedostupná a chyba by vypadala jako
problém sítě.

Pro provoz použijte jedno z:

```powershell
# Certifikát v LocalMachine\My (subject = hostname)
.\Install-MSProjectManager.ps1 -Hostname planovac.firma.cz -Port 443 `
    -CertificateThumbprint A1B2C3D4E5F6...
```

…nebo nechte službu na HTTP za reverzní proxy (IIS/ARR, nginx), která TLS
ukončí. V takovém případě `AllowedHosts` pořád nastavte na hostname, pod kterým
proxy aplikaci publikuje.

Cookie session má `SameSite=Strict` a `HttpOnly`; `Secure` se aktivuje s HTTPS.
Bez TLS jde přihlašovací cookie po síti v otevřené podobě — pro interní síť to
může být přijatelné, ale je to vědomé riziko, ne výchozí stav.

## Zálohování

Zálohovat je nutné **celou** `%ProgramData%\MSProjectManager`, tedy `data`
i `keys`:

- `data\` — SQLite databáze (`.db`, `-wal`, `-shm`). Zálohovat při zastavené
  službě, nebo přes `VSS`; kopie běžícího WAL souboru může být nekonzistentní.
- `keys\` — Data Protection key ring, kterým jsou šifrované ADO PATy (ADR-008).
  **Bez něj jsou uložené PATy po obnově nedešifrovatelné.** Záloha jen databáze
  vypadá kompletně a není.

Key ring je navíc svázaný se strojem (DPAPI local-machine), takže obnova na
*jinou* VM PATy stejně nerozšifruje — uživatelé je zadají znovu. Je to vědomá
volba (ADR-008), ne chyba obnovy.

## První spuštění

Aplikace nemá veřejnou registraci. Po prvním startu otevřete adresu v prohlížeči
a založte správcovský účet — nabídne se jen jednou, dokud žádný účet neexistuje.
Další účty pak zakládá admin ve **Správě uživatelů**.

## Diagnostika

```powershell
Get-Service MSProjectManager
Get-EventLog -LogName Application -Source MSProjectManager -Newest 20
```

Nejčastější potíže:

| Projev | Příčina |
|---|---|
| Služba naběhne a hned spadne | Chybí právo zápisu do `data\` — zkontrolujte ACL |
| `no such table: AspNetUsers` | Migrace neproběhly; typicky spuštění mimo `Production` |
| Prázdná bílá stránka | `wwwroot` bez `index.html` — publish běžel bez `build.sh web` |
| Přesměrování na HTTPS, které neodpovídá | `RequireHttps=true` bez certifikátu |
| Přihlášení projde, ale hned vyprší | Změněný key ring — ověřte, že se `keys\` nepřepsala |

## Odinstalace

```powershell
Stop-Service MSProjectManager
sc.exe delete MSProjectManager
Remove-Item 'C:\Program Files\MSProjectManager' -Recurse -Force
# Data a klíče záměrně nemaže; smažte ručně, až budete mít jistotu se zálohou.
```
