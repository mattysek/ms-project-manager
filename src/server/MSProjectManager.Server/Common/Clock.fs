/// Časová razítka.
///
/// Vlastní modul proto, že `nowIso` potřebuje actor (razítko autorství úkolu)
/// i persistence — a actor podle ADR-002 nesmí na perzistenční vrstvu sahat.
module MSProjectManager.Common.Clock

open System

/// ISO 8601 UTC — tvar, ve kterém časy ukládáme i posíláme na frontend.
let nowIso () =
    DateTimeOffset.UtcNow.ToString("o", Globalization.CultureInfo.InvariantCulture)
