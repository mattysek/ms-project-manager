/// Persistenční port actoru.
///
/// Actor nesmí znát EF ani SQLite — dostane dvě funkce a nic víc. Díky tomu
/// jde otestovat bez databáze a jeho testy zůstávají rychlé.
module MSProjectManager.Actors.ProjectStore

open MSProjectManager.Domain.State

/// Předchozí znění KB stránky, které jde do historie.
///
/// Vlastní typ, ne řádek z EF: actor nesmí znát perzistenční vrstvu, takže
/// se přes port posílá čistě doménová hodnota.
type KbPageSnapshot =
    {
        PageId: string
        Title: string
        Content: string
        SavedAt: string
        SavedBy: string
    }

/// Načtení a uložení stavu projektu.
[<NoEquality; NoComparison>]
type ProjectStore =
    {
        /// `None` znamená, že projekt v databázi není.
        Load: string -> Async<AppState option>
        /// Vrací `false`, pokud projekt mezitím zmizel.
        Save: string -> AppState -> Async<bool>
        /// Odloží předchozí verzi KB stránky do historie. Mimo `AppState`
        /// schválně — historie se čte na vyžádání, ne při každém `full_state`.
        ArchiveKbPage: string -> KbPageSnapshot -> Async<unit>
    }
