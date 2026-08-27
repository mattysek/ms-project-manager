/// Sdílená testovací data. Odpovídají scénáři z `docs/features/role-permissions.feature`:
/// projekt s PM "jan.novak" a Dev "petra.kolarova".
module MSProjectManager.Tests.Fixtures

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State

/// Účty (`AspNetUsers.Id`) a osoby v projektu (`Person.Id`) jsou dvě různé
/// entity — spojuje je `Person.UserId` (ADR-006, doplněk). Fixtures to drží
/// odděleně schválně, aby test odhalil záměnu.
let janId = "jan.novak"
let petraId = "petra.kolarova"

/// Id osob v projektu — jiná hodnota než id účtu.
let janPersonId = "os-jan"
let petraPersonId = "os-petra"
let externistaPersonId = "os-externista"

let pm =
    {
        UserId = janId
        DisplayName = "Jan Novák"
        Role = Pm
    }

let dev =
    {
        UserId = petraId
        DisplayName = "Petra Kolářová"
        Role = Dev
    }

let person (id: string) (userId: string | null) (name: string) (role: string) =
    {
        Id = id
        UserId = userId
        Name = name
        Role = role
        Color = "#4f9cf9"
        WeekAlloc = [ 100.0; 100.0; 100.0; 100.0 ]
    }

let task (id: string) (owner: string) =
    {
        Id = id
        P = owner
        Name = "Úkol " + id
        Cat = "obecne"
        S = 1
        E = 2
        Md = 5.0
        Progress = 0
        Desc = ""
        Links = []
        AdoNotes = None
        UpdatedBy = None
        UpdatedAt = None
    }

let milestone (id: string) =
    {
        Id = id
        Title = "M1 — Alpha release"
        WeekIndex = 3
        CheckItems = []
    }

let file (id: string) (owner: string) =
    {
        Id = id
        Name = "analyza.pdf"
        MimeType = "application/pdf"
        Size = 1024L
        AddedAt = "2026-02-01T10:00:00Z"
        AddedBy = owner
        Note = ""
    }

let risk (id: string) =
    {
        Id = id
        Sev = High
        Who = "Dodavatel"
        Title = "Zpoždění dodavatele"
        Detail = ""
    }

let kbPage (id: string) =
    {
        Id = id
        Title = "Onboarding"
        Content = "# Onboarding"
        CreatedAt = "2026-01-05T08:00:00Z"
        UpdatedAt = "2026-01-05T08:00:00Z"
        Tags = None
    }

let todo (id: string) =
    {
        Id = id
        Title = "Připravit demo"
        Completed = false
        CreatedAt = "2026-01-05T08:00:00Z"
    }

let reminder (id: string) =
    {
        Id = id
        Title = "Týdenní report"
        Description = ""
        StartDate = "2026-01-05"
        Recurrence = Weekly
        LastCompleted = None
        Enabled = true
    }

/// Projekt se dvěma osobami, dvěma úkoly, jedním milníkem a jednou přílohou.
let state: AppState =
    let baseState = initial "Backend refaktoring"

    { baseState with
        Project =
            { baseState.Project with
                StartDate = "2026-01-05"
                EndDate = "2026-06-26"
                Milestones = [ milestone "m1" ]
            }
        People =
            [
                person janPersonId janId "Jan Novák" "AR"
                person petraPersonId petraId "Petra Kolářová" "BE"
                person externistaPersonId null "Externista" "FE"
            ]
        Tasks = [ task "t-api" petraPersonId; task "t-infra" janPersonId ]
        Files = [ file "f1" janId; file "f2" petraId ]
    }
