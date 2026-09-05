/// Autentizace a správa účtů proti běžícímu serveru (PRD-01).
module MSProjectManager.Tests.AuthApiTests

open System.Net
open System.Net.Http
open System.Net.Http.Json
open System.Threading.Tasks
open Xunit
open MSProjectManager.Api.Contracts
open MSProjectManager.Tests.TestHost

let private adminName = "admin"
let private adminPassword = "Admin5678"

let private janName = "jan.novak"
let private janPassword = "Heslo1234"

/// Přihlášení daným klientem — testy níž se ptají jen na stavový kód.
let private login' (client: HttpClient) (userName: string) (password: string) =
    client.PostAsJsonAsync(
        "/auth/login",
        {
            UserName = userName
            Password = password
        }
    )

/// Server s adminem a účtem "jan.novak" — background z `auth.feature`.
let private withUsers (run: TestApp * Session * Session -> Task<unit>) =
    task {
        use app = new TestApp()
        let! admin = setupAdmin app adminName adminPassword
        let! jan = createUser app admin (janName, "Jan Novák", janPassword)
        do! run (app, admin, jan)
    }

// @scenario: auth.feature > První spuštění — vytvoření admin účtu
[<Fact>]
let ``prázdná databáze vyžaduje setup a vytvoří přihlášeného admina`` () =
    task {
        use app = new TestApp()
        let client = app.CreateClient()
        let! before = getJson<SetupState> client "/auth/setup-required"
        Assert.True before.Required

        let! admin = setupAdmin app adminName adminPassword
        Assert.True admin.User.IsAdmin
        Assert.Equal("Administrátor", admin.User.DisplayName)

        // Po setupu je uživatel rovnou přihlášený — session drží cookie.
        let! me = admin.Client.GetAsync "/auth/me"
        Assert.Equal(HttpStatusCode.OK, me.StatusCode)

        let! after = getJson<SetupState> client "/auth/setup-required"
        Assert.False after.Required
    }

// @scenario: auth.feature > Úspěšné přihlášení
[<Fact>]
let ``správné údaje přihlásí a vrátí display name`` () =
    withUsers (fun (app, _, _) ->
        task {
            let! session = login app janName janPassword
            Assert.Equal("Jan Novák", session.User.DisplayName)
            Assert.False session.User.IsAdmin

            let! projects = session.Client.GetAsync "/api/projects"
            Assert.Equal(HttpStatusCode.OK, projects.StatusCode)
        }
    )

// @scenario: auth.feature > Přihlášení se špatným heslem
[<Fact>]
let ``špatné heslo vrátí generickou hlášku`` () =
    withUsers (fun (app, _, _) ->
        task {
            let client = app.CreateClient()

            let! response =
                client.PostAsJsonAsync(
                    "/auth/login",
                    {
                        UserName = janName
                        Password = "SpatneHeslo"
                    }
                )

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode)
            let! body = readJson<ApiError> response
            Assert.Equal("Nesprávné uživatelské jméno nebo heslo", body.Message)
        }
    )

// @scenario: auth.feature > Přihlášení s neexistujícím uživatelským jménem
[<Fact>]
let ``neexistující účet vrátí stejnou hlášku jako špatné heslo`` () =
    withUsers (fun (app, _, _) ->
        task {
            let client = app.CreateClient()

            let! response =
                client.PostAsJsonAsync(
                    "/auth/login",
                    {
                        UserName = "neexistujici.uzivatel"
                        Password = "LibovolneHeslo"
                    }
                )

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode)
            let! body = readJson<ApiError> response
            // Stejná odpověď i stejný status — jinak by šlo účty vyzkoušet.
            Assert.Equal("Nesprávné uživatelské jméno nebo heslo", body.Message)
        }
    )

// @scenario: auth.feature > Persistentní session po reloadu stránky
[<Fact>]
let ``session přežije další požadavek`` () =
    withUsers (fun (app, _, _) ->
        task {
            let! session = login app janName janPassword
            let! first = getJson<CurrentUser> session.Client "/auth/me"
            let! second = getJson<CurrentUser> session.Client "/auth/me"
            Assert.Equal(first.UserId, second.UserId)
            Assert.Equal("Jan Novák", second.DisplayName)
        }
    )

// @scenario: auth.feature > Odhlášení
[<Fact>]
let ``po odhlášení je přístup k projektům odmítnut`` () =
    withUsers (fun (app, _, _) ->
        task {
            let! session = login app janName janPassword
            let! logout = session.Client.PostAsync("/auth/logout", null)
            Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode)

            let! projects = session.Client.GetAsync "/api/projects"
            Assert.Equal(HttpStatusCode.Unauthorized, projects.StatusCode)
        }
    )

// @scenario: auth.feature > Lockout po opakovaných špatných pokusech
[<Fact>]
let ``pět špatných pokusů účet dočasně zamkne`` () =
    withUsers (fun (app, _, _) ->
        task {
            let client = app.CreateClient()

            let attempt password =
                client.PostAsJsonAsync(
                    "/auth/login",
                    {
                        UserName = janName
                        Password = password
                    }
                )

            for _ in 1..5 do
                let! _ = attempt "SpatneHeslo"
                ()

            let! locked = attempt "SpatneHeslo"
            Assert.Equal(HttpStatusCode.Locked, locked.StatusCode)
            let! body = readJson<ApiError> locked
            Assert.Equal("Účet je dočasně uzamčen. Zkuste to znovu za 15 minut.", body.Message)

            // Ani správné heslo během lockoutu neprojde.
            let! withCorrect = attempt janPassword
            Assert.Equal(HttpStatusCode.Locked, withCorrect.StatusCode)
        }
    )

// @scenario: auth.feature > Změna vlastního hesla
[<Fact>]
let ``změna hesla zneplatní staré a povolí nové`` () =
    withUsers (fun (app, _, _) ->
        task {
            let! session = login app janName janPassword

            let! changed =
                session.Client.PostAsJsonAsync(
                    "/auth/change-password",
                    {
                        CurrentPassword = janPassword
                        NewPassword = "NoveHeslo99"
                    }
                )

            Assert.Equal(HttpStatusCode.OK, changed.StatusCode)

            let client = app.CreateClient()

            let! withOld =
                client.PostAsJsonAsync(
                    "/auth/login",
                    {
                        UserName = janName
                        Password = janPassword
                    }
                )

            Assert.Equal(HttpStatusCode.Unauthorized, withOld.StatusCode)
            let! withNew = login app janName "NoveHeslo99"
            Assert.Equal("Jan Novák", withNew.User.DisplayName)
        }
    )

// @scenario: auth.feature > Nové heslo nesplňuje minimální délku
[<Fact>]
let ``krátké heslo je odmítnuto s českou hláškou`` () =
    withUsers (fun (app, _, _) ->
        task {
            let! session = login app janName janPassword

            let! response =
                session.Client.PostAsJsonAsync(
                    "/auth/change-password",
                    {
                        CurrentPassword = janPassword
                        NewPassword = "kr"
                    }
                )

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
            let! body = readJson<ApiError> response
            Assert.Equal("Heslo musí mít alespoň 8 znaků", body.Message)
        }
    )

// @scenario: auth.feature > Admin vytvoří nový uživatelský účet
[<Fact>]
let ``admin založí účet, který se rovnou přihlásí`` () =
    withUsers (fun (app, admin, _) ->
        task {
            let! petra = createUser app admin ("petra.kolarova", "Petra Kolářová", "DocasneHeslo1")
            Assert.Equal("Petra Kolářová", petra.User.DisplayName)

            let! users = getJson<UserSummary[]> admin.Client "/admin/users"
            Assert.Contains(users, (fun user -> user.UserName = "petra.kolarova" && user.IsActive))
        }
    )

// @scenario: auth.feature > Admin deaktivuje uživatelský účet
[<Fact>]
let ``deaktivovaný účet se nepřihlásí, ale data zůstanou`` () =
    withUsers (fun (app, admin, jan) ->
        task {

            let! project = jan.Client.PostAsJsonAsync("/api/projects", { Name = "Backend refaktoring" })

            Assert.Equal(HttpStatusCode.OK, project.StatusCode)
            let! created = readJson<ProjectSummaryResponse> project

            // Jan je zakladatel, tedy jediný PM. Deaktivace by projekt osiřela,
            // takže se nejdřív musí přidat druhý PM — to je i zamýšlený postup.
            let! _ =
                jan.Client.PostAsJsonAsync(
                    $"/api/projects/{created.Id}/members",
                    {
                        UserId = admin.User.UserId
                        Role = "pm"
                    }
                )

            let! response = admin.Client.PostAsync($"/admin/users/{jan.User.UserId}/deactivate", null)
            Assert.Equal(HttpStatusCode.OK, response.StatusCode)

            let client = app.CreateClient()

            let! attempt =
                client.PostAsJsonAsync(
                    "/auth/login",
                    {
                        UserName = janName
                        Password = janPassword
                    }
                )

            Assert.Equal(HttpStatusCode.Unauthorized, attempt.StatusCode)

            // Data zůstávají — projekt je v databázi i po deaktivaci účtu.
            let! users = getJson<UserSummary[]> admin.Client "/admin/users"
            Assert.Contains(users, (fun user -> user.UserName = janName && not user.IsActive))
        }
    )

[<Fact>]
let ``neadmin se do správy uživatelů nedostane`` () =
    withUsers (fun (_, _, jan) ->
        task {
            let! response = jan.Client.GetAsync "/admin/users"
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode)
        }
    )

[<Fact>]
let ``nepřihlášený uživatel dostane 401, ne přesměrování`` () =
    task {
        use app = new TestApp()
        let client = app.CreateClient()
        let! response = client.GetAsync "/api/projects"
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode)
    }

// @scenario: auth.feature > Admin nemůže deaktivovat posledního PM projektu
[<Fact>]
let ``posledního PM projektu nelze deaktivovat`` () =
    withUsers (fun (_, admin, jan) ->
        task {
            let! project = jan.Client.PostAsJsonAsync("/api/projects", { Name = "Backend refaktoring" })
            let! _ = readJson<ProjectSummaryResponse> project

            let! response = admin.Client.PostAsync($"/admin/users/{jan.User.UserId}/deactivate", null)

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
            let! message = response.Content.ReadAsStringAsync()
            Assert.Contains("jediným Project Managerem", message)
            Assert.Contains("Backend refaktoring", message)

            // Účet zůstal aktivní — přihlášení pořád funguje.
            let! attempt = login' jan.Client janName janPassword
            Assert.Equal(HttpStatusCode.OK, attempt.StatusCode)
        }
    )

// @scenario: auth.feature > Admin obnoví deaktivovaný účet
[<Fact>]
let ``deaktivovaný účet jde znovu aktivovat`` () =
    withUsers (fun (app, admin, jan) ->
        task {
            let! _ = admin.Client.PostAsync($"/admin/users/{jan.User.UserId}/deactivate", null)
            let! reactivated = admin.Client.PostAsync($"/admin/users/{jan.User.UserId}/activate", null)
            Assert.Equal(HttpStatusCode.OK, reactivated.StatusCode)

            let client = app.CreateClient()
            let! attempt = login' client janName janPassword
            Assert.Equal(HttpStatusCode.OK, attempt.StatusCode)
        }
    )

// @scenario: auth.feature > Admin resetuje heslo uživateli
[<Fact>]
let ``admin resetuje heslo bez znalosti původního`` () =
    withUsers (fun (app, admin, jan) ->
        task {
            let! reset =
                admin.Client.PostAsJsonAsync(
                    $"/admin/users/{jan.User.UserId}/reset-password",
                    {| NewPassword = "NoveHeslo99" |}
                )

            Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode)

            let! withNew = login' (app.CreateClient()) janName "NoveHeslo99"
            Assert.Equal(HttpStatusCode.OK, withNew.StatusCode)

            let! withOld = login' (app.CreateClient()) janName janPassword
            Assert.Equal(HttpStatusCode.Unauthorized, withOld.StatusCode)
        }
    )

// ── Samoobslužná registrace (FR-AUTH-08, ADR-003 doplněk) ───────────────────

/// Registrační požadavek daným klientem.
let private registerWith (client: HttpClient) (userName: string, displayName: string, password: string) =
    client.PostAsJsonAsync(
        "/auth/register",
        {
            UserName = userName
            DisplayName = displayName
            Password = password
        }
    )

/// Server s hotovým setupem — registrace se testuje nad rozběhnutým systémem.
let private withAdmin (run: TestApp -> Task<unit>) =
    task {
        use app = new TestApp()
        let! _ = setupAdmin app adminName adminPassword
        do! run app
    }

// @scenario: auth.feature > Registrace nového uživatele
[<Fact>]
let ``registrace založí běžný účet a rovnou přihlásí`` () =
    withAdmin (fun app ->
        task {
            let client = app.CreateClient()
            let! response = registerWith client ("petra.kolarova", "Petra Kolářová", "Heslo1234")

            Assert.Equal(HttpStatusCode.OK, response.StatusCode)
            let! current = readJson<CurrentUser> response
            Assert.Equal("Petra Kolářová", current.DisplayName)
            // Registrací se nikdo nestává adminem — to je celý rozdíl proti
            // prvnímu spuštění (FR-AUTH-07).
            Assert.False current.IsAdmin

            // Odpověď nese cookie, takže je uživatel rovnou přihlášený.
            let! me = client.GetAsync "/auth/me"
            Assert.Equal(HttpStatusCode.OK, me.StatusCode)

            // A nemá žádný projekt, dokud si nějaký nezaloží nebo ho někdo nepřidá.
            let! projects = getJson<ProjectSummaryResponse list> client "/api/projects"
            Assert.Empty projects
        }
    )

// @scenario: auth.feature > Registrovaný uživatel se po odhlášení přihlásí svým heslem
[<Fact>]
let ``registrovaný účet funguje i po odhlášení`` () =
    withAdmin (fun app ->
        task {
            let client = app.CreateClient()
            let! _ = registerWith client ("petra.kolarova", "Petra Kolářová", "Heslo1234")
            let! _ = client.PostAsync("/auth/logout", null)

            let! session = login app "petra.kolarova" "Heslo1234"

            Assert.Equal("Petra Kolářová", session.User.DisplayName)
        }
    )

// @scenario: auth.feature > Registrace s obsazeným uživatelským jménem
[<Fact>]
let ``obsazené jméno registraci odmítne`` () =
    // Na rozdíl od přihlášení registrace existenci účtu prozradit MUSÍ —
    // jinak nejde říct, proč založení neprošlo (ADR-003, doplněk).
    withAdmin (fun app ->
        task {
            let client = app.CreateClient()
            let! _ = registerWith client (janName, "Jan Novák", janPassword)

            let second = app.CreateClient()
            let! response = registerWith second (janName, "Někdo jiný", "JineHeslo9")

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
            let! body = readJson<ApiError> response
            Assert.Equal("Uživatelské jméno je již obsazeno", body.Message)
        }
    )

// @scenario: auth.feature > Registrace s krátkým heslem
[<Fact>]
let ``krátké heslo registraci odmítne`` () =
    withAdmin (fun app ->
        task {
            let client = app.CreateClient()
            let! response = registerWith client ("petra.kolarova", "Petra Kolářová", "kr")

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
            let! body = readJson<ApiError> response
            Assert.Equal(MSProjectManager.Api.Auth.PasswordTooShort, body.Message)
        }
    )

// @scenario: auth.feature > Vypnutá registrace odmítne i přímé volání
[<Fact>]
let ``vypnutá registrace odmítne i přímé volání`` () =
    // Skrytý odkaz v UI není autorizace — rozhoduje server.
    task {
        use app = new TestApp([ "Auth:AllowSelfRegistration", "false" ])
        let! _ = setupAdmin app adminName adminPassword

        let client = app.CreateClient()
        let! response = registerWith client ("petra.kolarova", "Petra Kolářová", "Heslo1234")

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode)

        // A účet opravdu nevznikl.
        let! attempt =
            client.PostAsJsonAsync(
                "/auth/login",
                {
                    UserName = "petra.kolarova"
                    Password = "Heslo1234"
                }
            )

        Assert.Equal(HttpStatusCode.Unauthorized, attempt.StatusCode)
    }

// @scenario: auth.feature > Vypnutá registrace nenabízí odkaz
[<Fact>]
let ``příznak registrace se posílá klientovi`` () =
    // Klient podle něj skrývá odkaz; hodnota musí odpovídat konfiguraci.
    task {
        use enabled = new TestApp()
        let! zapnuto = getJson<SetupState> (enabled.CreateClient()) "/auth/setup-required"
        Assert.True zapnuto.RegistrationAllowed

        use disabled = new TestApp([ "Auth:AllowSelfRegistration", "false" ])
        let! vypnuto = getJson<SetupState> (disabled.CreateClient()) "/auth/setup-required"
        Assert.False vypnuto.RegistrationAllowed
    }

// @scenario: auth.feature > Registrace do prázdné databáze se odmítne
[<Fact>]
let ``registrace do prázdné databáze se odmítne`` () =
    // Do prázdné DB patří admin přes `/auth/setup`. Bez téhle pojistky by
    // první příchozí dostal běžný účet a systém by zůstal bez administrátora.
    task {
        use app = new TestApp()
        let client = app.CreateClient()

        let! response = registerWith client ("petra.kolarova", "Petra Kolářová", "Heslo1234")

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode)

        // Setup je pořád nabízený a pořád funguje.
        let! state = getJson<SetupState> client "/auth/setup-required"
        Assert.True state.Required
    }
