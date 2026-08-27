/// Drobné operace nad seznamy entit, které reducer používá pořád dokola.
/// Entity mají id typu `string`, proto se identifikátor předává selektorem.
module MSProjectManager.Common.Collections

/// Existuje v seznamu entita s daným id?
let containsId (getId: 'T -> string) (id: string) (items: 'T list) =
    items |> List.exists (fun item -> getId item = id)

/// Najde entitu podle id.
let tryFindById (getId: 'T -> string) (id: string) (items: 'T list) =
    items |> List.tryFind (fun item -> getId item = id)

/// Nahradí entitu s daným id výsledkem funkce; ostatní nechá být.
let updateById (getId: 'T -> string) (id: string) (update: 'T -> 'T) (items: 'T list) =
    items |> List.map (fun item -> if getId item = id then update item else item)

/// Odstraní entitu s daným id.
let removeById (getId: 'T -> string) (id: string) (items: 'T list) =
    items |> List.filter (fun item -> getId item <> id)

/// Přidá entitu na konec seznamu (pořadí odpovídá pořadí přidání na klientovi).
let append (item: 'T) (items: 'T list) = items @ [ item ]
