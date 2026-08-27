<#
.SYNOPSIS
    Nainstaluje nebo aktualizuje MSProjectManager jako Windows Service.

.DESCRIPTION
    Skript je psaný tak, aby se dal pustit opakovaně: při první instalaci
    službu založí, při dalších ji zastaví, zazálohuje data, přepíše binárky
    a zase ji spustí. Data ani klíče nikdy nemaže.

    Co dělá a proč (podrobnosti v ADR-003, ADR-008, PRD-00):

    - Data a klíče drží MIMO instalační složku (výchozí %ProgramData%).
      Kdyby ležely vedle binárek, každá aktualizace by je přepsala — a hlavně:
      pod Program Files nemá účet služby právo zápisu, takže by SQLite ani
      nezaložilo WAL soubory.
    - Zálohuje se `data` I `keys`. Bez key ringu jsou uložené ADO PATy po obnově
      nedešifrovatelné (ADR-008). Záloha jen databáze je past.
    - Účet služby dostane právo zápisu jen do těch dvou složek, nikam jinam.
    - `AllowedHosts` se nastaví na hostname; ponechat `*` znamená přijímat
      požadavky s libovolnou hlavičkou Host.
    - S `-CertificateThumbprint` dostane účet služby i právo ČTENÍ na privátní
      klíč certifikátu. Bez něj Kestrel při startu TLS spadne s chybou SSPI
      0x8009030D ("cryptographic module") — certifikát v LocalMachine\My smí
      použít jen účet, který ho tam naimportoval (typicky správce), ne
      NetworkService, pod kterým běží služba.

.PARAMETER Hostname
    Hostname, na kterém bude služba dostupná. Zapíše se do `AllowedHosts`
    a použije se pro kontrolu po startu.

.PARAMETER InstallPath
    Kam nainstalovat binárky. Výchozí C:\Program Files\MSProjectManager.

.PARAMETER DataPath
    Kam ukládat databázi a klíče. Výchozí C:\ProgramData\MSProjectManager.

.PARAMETER Port
    Port, na kterém služba poslouchá. Výchozí 8080 (HTTP).

.PARAMETER CertificateThumbprint
    Otisk certifikátu v LocalMachine\My. Když je zadaný, služba běží na HTTPS
    a zapne se HSTS. Bez něj běží HTTP a skript SNÍŽÍ `Auth:RequireHttps`,
    protože jinak by server přesměrovával na HTTPS, které nikde neposlouchá.

.PARAMETER SkipBackup
    Přeskočí zálohu. Používat jen při úplně první instalaci.

.EXAMPLE
    .\Install-MSProjectManager.ps1 -Hostname planovac.firma.cz

.EXAMPLE
    .\Install-MSProjectManager.ps1 -Hostname planovac.firma.cz -Port 443 `
        -CertificateThumbprint A1B2C3D4E5F6...
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Hostname,

    [string] $InstallPath = 'C:\Program Files\MSProjectManager',
    [string] $DataPath = 'C:\ProgramData\MSProjectManager',
    [int]    $Port = 8080,
    [string] $CertificateThumbprint = '',
    [switch] $SkipBackup
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ServiceName = 'MSProjectManager'
$DisplayName = 'MS Project Manager'
$ExeName = 'MSProjectManager.Server.exe'
$SourceDir = $PSScriptRoot
# Pod tímhle účtem služba běží (New-DataFolders, Install-Service i
# Grant-CertificatePrivateKeyAccess ho musí mít stejný, jinak ACL cílí jinam
# než skutečný běžící proces).
$ServiceAccount = 'NT AUTHORITY\NetworkService'

function Write-Step($message) { Write-Host "▸ $message" -ForegroundColor Cyan }
function Write-Ok($message) { Write-Host "✓ $message" -ForegroundColor Green }
function Write-Warn($message) { Write-Host "! $message" -ForegroundColor Yellow }

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Skript musí běžet jako správce (zakládá službu a mění ACL).'
    }
}

function Assert-PublishFolder {
    $exe = Join-Path $SourceDir $ExeName
    if (-not (Test-Path $exe)) {
        throw "V $SourceDir není $ExeName. Skript se pouští ze složky publish/."
    }
    # Frontend se servíruje z wwwroot; bez něj by server běžel, ale vracel by
    # jen prázdnou stránku — a to je chyba, na kterou se přijde až v prohlížeči.
    if (-not (Test-Path (Join-Path $SourceDir 'wwwroot\index.html'))) {
        throw 'Ve wwwroot chybí index.html — publish proběhl bez `build.sh web`.'
    }
}

function Stop-ExistingService {
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $service) { return $false }

    if ($service.Status -ne 'Stopped') {
        Write-Step "Zastavuji službu $ServiceName"
        Stop-Service -Name $ServiceName -Force
        # Actor drží stav v paměti a ukládá po ticku (PersistIntervalSeconds).
        # `Stop-Service` se vrátí, jakmile se služba ohlásí zastavená; chvíli
        # počkáme, ať doběhne flush na disk, než sáhneme na soubory.
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
        Start-Sleep -Seconds 2
    }
    return $true
}

function Backup-Data {
    if ($SkipBackup) { Write-Warn 'Záloha přeskočena (-SkipBackup)'; return }
    if (-not (Test-Path $DataPath)) { Write-Step 'Není co zálohovat (první instalace)'; return }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $target = Join-Path $DataPath "backup\$stamp"
    New-Item -ItemType Directory -Path $target -Force | Out-Null

    foreach ($folder in @('data', 'keys')) {
        $source = Join-Path $DataPath $folder
        if (Test-Path $source) {
            Copy-Item -Path $source -Destination $target -Recurse -Force
        }
    }

    Write-Ok "Záloha: $target"
    Write-Warn 'Zálohu odneste mimo tento server — key ring je svázaný se strojem (DPAPI).'
}

function Copy-Binaries {
    Write-Step "Kopíruji binárky do $InstallPath"
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

    # wwwroot se maže celý: build produkuje hashované názvy, takže bez smazání
    # by se ve složce vrstvily assety ze všech předchozích verzí.
    $wwwroot = Join-Path $InstallPath 'wwwroot'
    if (Test-Path $wwwroot) { Remove-Item $wwwroot -Recurse -Force }

    Get-ChildItem -Path $SourceDir -Exclude 'Install-MSProjectManager.ps1', 'README-nasazeni.md' |
        Copy-Item -Destination $InstallPath -Recurse -Force

    Write-Ok 'Binárky nakopírovány'
}

function New-DataFolders {
    Write-Step "Připravuji zapisovatelné složky v $DataPath"
    foreach ($folder in @('data', 'keys')) {
        New-Item -ItemType Directory -Path (Join-Path $DataPath $folder) -Force | Out-Null
    }

    # Zapisovatelná musí být celá SLOŽKA, ne jen soubor databáze — WAL mód
    # zakládá sourozence -wal a -shm (PRD-00).
    $acl = Get-Acl $DataPath
    $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        $ServiceAccount, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -Path $DataPath -AclObject $acl

    Write-Ok "Práva zápisu pro $ServiceAccount nastavena na $DataPath"
}

function Grant-ReadAccessAsSystem {
    <#
        Soubory pod SystemKeys\ vlastní NT AUTHORITY\SYSTEM a jejich ACL nejde
        zapsat ani jako správce (chybí WRITE_DAC) — obvyklé řešení je
        `takeown /F`, jenže to natrvalo přepíše Owner ze SYSTEM na správce.
        To je pro pouhé přidání jednoho práva ke čtení zbytečně invazivní
        změna a v auditu vypadá hůř, než co se skutečně stalo.

        Místo toho spustí icacls SYSTEM sám — přes dočasnou naplánovanou
        úlohu s LogonType ServiceAccount. SYSTEM soubor už vlastní, takže ACL
        zapíše bez jakéhokoli přebírání. Úloha se smaže hned po doběhnutí
        (try/finally), na disku ani v Plánovači úloh po ní nic nezůstane.
    #>
    param(
        [Parameter(Mandatory = $true)] [string] $Path,
        [Parameter(Mandatory = $true)] [string] $Account
    )

    $taskName = "MSPM-GrantKeyAccess-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
    $action = New-ScheduledTaskAction -Execute 'icacls.exe' -Argument "`"$Path`" /grant `"${Account}:(R)`""
    $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal | Out-Null
    try {
        Start-ScheduledTask -TaskName $taskName

        $deadline = (Get-Date).AddSeconds(15)
        do {
            Start-Sleep -Milliseconds 200
            $state = (Get-ScheduledTask -TaskName $taskName).State
        } while ($state -eq 'Running' -and (Get-Date) -lt $deadline)

        $result = (Get-ScheduledTaskInfo -TaskName $taskName).LastTaskResult
        if ($result -ne 0) {
            throw "icacls spuštěný jako SYSTEM selhal (návratový kód $result)"
        }
    } finally {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
}

function Grant-CertificatePrivateKeyAccess {
    <#
        Kestrel běží pod $ServiceAccount, ne pod účtem, který certifikát do
        LocalMachine\My naimportoval (typicky správce) — a jen ten druhý má
        na privátní klíč přístup ve výchozím stavu. Bez tohohle kroku selže
        start TLS s chybou SSPI 0x8009030D ("cryptographic module"), viditelnou
        jen v systémovém logu, ne v logu aplikace.

        Klíč může být uložený dvěma různými způsoby (novější CNG, nebo starší
        CAPI) a každý žije jinde na disku. U CNG navíc nestačí ani to — pokud
        byl certifikát dovezený přes MMC/AD CS s izolací jen pro účet SYSTEM,
        klíč leží v `SystemKeys\`, ne v `Keys\`. Proto se cesta nehádá jedním
        pevným vzorem, ale hledá se podle jména souboru napříč celým
        `%ProgramData%\Microsoft\Crypto\`, a zápis ACL na SYSTEM-vlastněný
        soubor jde přes Grant-ReadAccessAsSystem — ne přes převzetí
        vlastnictví (viz její komentář).
    #>
    param(
        [Parameter(Mandatory = $true)] [string] $Thumbprint,
        [Parameter(Mandatory = $true)] [string] $Account
    )

    Write-Step "Nastavuji čtení privátního klíče certifikátu pro $Account"

    $cert = Get-ChildItem "Cert:\LocalMachine\My\$Thumbprint" -ErrorAction SilentlyContinue
    if (-not $cert) {
        throw "Certifikát s otiskem '$Thumbprint' nebyl nalezen v LocalMachine\My."
    }
    if (-not $cert.HasPrivateKey) {
        throw "Certifikát '$Thumbprint' nemá privátní klíč — Kestrel by na něm TLS spojení nenavázal."
    }

    $rsaKey = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
    if (-not $rsaKey) {
        throw "Privátní klíč certifikátu '$Thumbprint' není RSA — skript umí nastavit oprávnění jen pro RSA klíče."
    }

    if ($rsaKey -is [Security.Cryptography.RSACng]) {
        $keyFileName = $rsaKey.Key.UniqueName
    } else {
        $keyFileName = $rsaKey.CspKeyContainerInfo.UniqueKeyContainerName
    }

    $cryptoRoot = Join-Path $env:ProgramData 'Microsoft\Crypto'
    $keyPath =
        Get-ChildItem -Path $cryptoRoot -Recurse -Filter $keyFileName -File -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty FullName

    if (-not $keyPath) {
        throw "Soubor privátního klíče '$keyFileName' nebyl nalezen pod $cryptoRoot (certifikát $Thumbprint). Není klíč na hardwarovém tokenu / TPM?"
    }

    $targetSid = ([Security.Principal.NTAccount] $Account).Translate([Security.Principal.SecurityIdentifier])
    $acl = Get-Acl -Path $keyPath

    $alreadyGranted = $acl.Access | Where-Object {
        ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Read) -and
        $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $targetSid.Value
    }

    if ($alreadyGranted) {
        Write-Ok 'Právo čtení na privátní klíč už bylo nastaveno dřív'
        return
    }

    try {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($Account, 'Read', 'Allow')
        $acl.AddAccessRule($rule)
        Set-Acl -Path $keyPath -AclObject $acl
    } catch [UnauthorizedAccessException] {
        # Soubor patří SYSTEM (typicky SystemKeys\) a jeho ACL nejde zapsat
        # ani jako správce — Grant-ReadAccessAsSystem přidá právo jako SYSTEM
        # sám, beze změny vlastnictví.
        Write-Warn 'Přímý zápis ACL odmítnut (soubor patří SYSTEM) — právo přidávám úlohou spuštěnou jako SYSTEM'
        Grant-ReadAccessAsSystem -Path $keyPath -Account $Account
    }

    Write-Ok "Právo čtení privátního klíče uděleno: $keyPath"
}

function Write-Configuration {
    Write-Step 'Zapisuji appsettings.Production.json'

    $scheme = if ($CertificateThumbprint) { 'https' } else { 'http' }
    $requireHttps = [bool] $CertificateThumbprint

    if (-not $requireHttps) {
        Write-Warn 'Bez certifikátu běží služba na HTTP a RequireHttps se vypíná.'
        Write-Warn 'Pro provoz doporučuji certifikát (-CertificateThumbprint) nebo reverzní proxy s TLS.'
    }

    $settings = [ordered]@{
        AllowedHosts = $Hostname
        Urls         = "${scheme}://+:$Port"
        Database     = @{ Path = (Join-Path $DataPath 'data\msprojectmanager.db') }
        DataProtection = @{ KeysPath = (Join-Path $DataPath 'keys') }
        Auth         = @{ RequireHttps = $requireHttps }
    }

    if ($CertificateThumbprint) {
        $settings.Kestrel = @{
            Endpoints = @{
                Https = @{
                    Url         = "https://+:$Port"
                    Certificate = @{ Store = 'My'; Location = 'LocalMachine'; Subject = $Hostname; AllowInvalid = $false }
                }
            }
        }
    }

    $path = Join-Path $InstallPath 'appsettings.Production.json'
    $settings | ConvertTo-Json -Depth 8 | Set-Content -Path $path -Encoding UTF8
    Write-Ok "Konfigurace: $path"
}

function Install-Service {
    $exe = Join-Path $InstallPath $ExeName
    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

    if ($existing) {
        Write-Step 'Aktualizuji definici služby'
        sc.exe config $ServiceName binPath= "`"$exe`"" start= auto | Out-Null
    } else {
        Write-Step 'Zakládám službu'
        New-Service -Name $ServiceName -BinaryPathName "`"$exe`"" `
            -DisplayName $DisplayName -StartupType Automatic `
            -Description 'Kapacitní plánování a správa projektů (interní nástroj).' | Out-Null
        sc.exe config $ServiceName obj= $ServiceAccount | Out-Null
    }

    # Po pádu se služba sama zvedne; třetí pokus až po minutě, ať se
    # neopakovaný problém (rozbitá DB) nezacyklí do nekonečna.
    sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/60000 | Out-Null

    # ASPNETCORE_ENVIRONMENT musí být Production, jinak se appsettings.Production.json
    # vůbec nenačte a služba by jela na výchozích (vývojových) hodnotách.
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName" `
        -Name Environment -Value @('ASPNETCORE_ENVIRONMENT=Production') -Type MultiString

    Write-Ok 'Služba nastavena'
}

function Open-Firewall {
    $ruleName = "MSProjectManager ($Port)"

    # Název pravidla nese port, takže opakovaný běh se změněným -Port by jinak
    # jen přidával další a další pravidla — staré zůstane otevřené i pro port,
    # na kterém už dávno nic neposlouchá. Napřed se uklidí všechna dřívější
    # pravidla tohoto skriptu, pak se založí jedno pro aktuální port.
    Get-NetFirewallRule -DisplayName 'MSProjectManager (*)' -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -ne $ruleName } |
        Remove-NetFirewallRule

    if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) { return }

    Write-Step "Otevírám port $Port ve firewallu (profil Domain, Private)"
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort $Port -Profile Domain, Private | Out-Null
    Write-Ok 'Pravidlo firewallu přidáno'
}

function Start-AndVerify {
    Write-Step 'Spouštím službu'
    Start-Service -Name $ServiceName

    $scheme = if ($CertificateThumbprint) { 'https' } else { 'http' }
    $url = "${scheme}://${Hostname}:$Port/auth/setup-required"

    # Po startu běží EF migrace, takže první odpověď chvíli trvá. Kontroluje se
    # skutečný endpoint, ne jen stav služby: „Running" znamená jen že proces
    # nespadl, ne že aplikace odpovídá.
    foreach ($attempt in 1..15) {
        Start-Sleep -Seconds 2
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Ok "Služba odpovídá na $scheme`://${Hostname}:$Port"
                return
            }
        } catch {
            if ($attempt -eq 15) {
                Write-Warn "Služba neodpověděla na $url"
                Write-Warn 'Log: Event Viewer → Windows Logs → Application, zdroj MSProjectManager.'
                throw
            }
        }
    }
}

Assert-Administrator
Assert-PublishFolder

Write-Host ''
Write-Host "Instalace $DisplayName" -ForegroundColor White
Write-Host "  hostname : $Hostname"
Write-Host "  binárky  : $InstallPath"
Write-Host "  data     : $DataPath"
Write-Host "  port     : $Port"
Write-Host ''

$wasRunning = Stop-ExistingService
Backup-Data
Copy-Binaries
New-DataFolders
Write-Configuration
Install-Service
if ($CertificateThumbprint) {
    Grant-CertificatePrivateKeyAccess -Thumbprint $CertificateThumbprint -Account $ServiceAccount
}
Open-Firewall
Start-AndVerify

Write-Host ''
Write-Ok 'Hotovo.'
if (-not $wasRunning) {
    Write-Host ''
    Write-Host 'První spuštění: otevřete aplikaci v prohlížeči a založte správcovský účet.' -ForegroundColor White
    Write-Host 'Registrace je jednorázová — jakmile účet existuje, další zakládá admin.' -ForegroundColor White
}
Write-Host ''
Write-Warn 'Do zálohovacího plánu přidejte CELOU složku:'
Write-Host "  $DataPath  (data i keys — bez key ringu jsou ADO PATy nečitelné)"
