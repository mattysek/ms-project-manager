/// Převod HTML ↔ markdown a otisk popisu (ADR-008).
///
/// ADO drží popis work itemu jako HTML, plánovač jako markdown. Porovnání
/// popisů proto musí projít normalizací na jednom místě — kdyby konvertoval
/// každý svoje, hlásil by sync rozdíl při každém běhu. Po migraci konvertuje
/// **výhradně server**: klient dostává popis už jako markdown
/// (`AdoWorkItemView.DescriptionMd`) a HTML si skládá jen pro náhled.
///
/// `descriptionHash` je port `computeDescriptionHashSync` z
/// `src/utils/htmlMarkdownConverter.ts` — stejná aritmetika, aby snapshoty
/// z jednorázové verze zůstaly porovnatelné.
module MSProjectManager.Domain.AdoMarkdown

open System
open System.Net
open System.Text.RegularExpressions

let private options = RegexOptions.IgnoreCase ||| RegexOptions.Singleline

let private replace (pattern: string) (replacement: string) (input: string) =
    Regex.Replace(input, pattern, replacement, options)

let private replaceWith (pattern: string) (evaluator: Match -> string) (input: string) =
    Regex.Replace(input, pattern, MatchEvaluator evaluator, options)

/// `<h3>` → `### `. Úroveň je v první skupině.
let private headingOpen (m: Match) =
    "\n" + String.replicate (int m.Groups.[1].Value) "#" + " "

/// Značky, které nenesou obsah — pryč i s vnitřkem.
let private stripNonContent (html: string) =
    [ "script"; "style"; "noscript"; "head" ]
    |> List.fold (fun acc tag -> replace $"<{tag}[^>]*>.*?</{tag}>" "" acc) html
    |> replace "<(meta|link)[^>]*/?>" ""
    |> replace "<!--.*?-->" ""

/// Blokové značky na konce řádků. Pořadí je podstatné: nejdřív ty, které
/// nesou vlastní tvar (nadpis, odrážka), teprve pak generické bloky.
///
/// Blok **otevírá** řádek, nejen ukončuje. `</li>` po sobě žádný konec řádku
/// nenechává (o odsazení dalšího bodu se stará `<li>`), takže dokud otevírací
/// značka nic nedělala, přilepil se první blok za seznamem na poslední
/// odrážku: `<li>druhý bod</li><div>1. krok</div>` dalo „druhý bod1. krok".
/// Slepená slova pak nešla ani přečíst v náhledu, ani porovnat s popisem
/// v plánovači — sync na nich hlásil rozdíl pořád dokola.
let private blocksToMarkdown (html: string) =
    html
    |> replace "<br\\s*/?>" "\n"
    |> replaceWith "<h([1-6])[^>]*>\\s*" headingOpen
    |> replace "</h[1-6]>" "\n"
    |> replace "<li[^>]*>\\s*" "\n- "
    |> replace "</li>" ""
    |> replace "</(ul|ol|p|div|tr|table|blockquote)>" "\n"
    |> replace "<(ul|ol|p|div|tr|table|blockquote)[^>]*>" "\n"
    |> replace "<hr\\s*/?>" "\n---\n"
    |> replace "<(td|th)[^>]*>" " "

/// Inline značky.
let private inlineToMarkdown (html: string) =
    html
    |> replace "<(strong|b)[^>]*>" "**"
    |> replace "</(strong|b)>" "**"
    |> replace "<(em|i)[^>]*>" "*"
    |> replace "</(em|i)>" "*"
    |> replace "<pre[^>]*>" "\n```\n"
    |> replace "</pre>" "\n```\n"
    |> replace "<code[^>]*>" "`"
    |> replace "</code>" "`"
    |> replace "<a[^>]*href=[\"']([^\"']*)[\"'][^>]*>(.*?)</a>" "[$2]($1)"
    |> replace "<img[^>]*alt=[\"']([^\"']*)[\"'][^>]*>" "![$1]"

/// HTML z ADO na markdown.
let htmlToMarkdown (html: string | null) : string =
    match html with
    | null -> ""
    | value when String.IsNullOrWhiteSpace value -> ""
    | value ->
        value
        |> replace "\\s+" " "
        |> stripNonContent
        |> blocksToMarkdown
        |> inlineToMarkdown
        |> replace "<[^>]+>" ""
        |> WebUtility.HtmlDecode
        // HtmlDecode je v BCL anotovaný jako nullable, byť pro nenulový vstup
        // nulu nevrací.
        |> nonNull
        |> replace "[ \\t]+\n" "\n"
        |> replace "\n{3,}" "\n\n"
        |> fun text -> text.Trim()

// ── Markdown → HTML (pro zápis do ADO) ──────────────────────────────────────

let private escapeHtml (text: string) =
    text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")

let private inlineToHtml (line: string) =
    line
    |> replace "\\*\\*(.+?)\\*\\*" "<strong>$1</strong>"
    |> replace "(?<![\\*])\\*([^\\*]+)\\*(?![\\*])" "<em>$1</em>"
    |> replace "`([^`]+)`" "<code>$1</code>"
    |> replace "\\[([^\\]]+)\\]\\(([^)]+)\\)" "<a href=\"$2\">$1</a>"

let private lineToHtml (line: string) =
    let trimmed = line.Trim()

    if trimmed = "" then
        ""
    elif trimmed.StartsWith "- " then
        $"<li>{inlineToHtml (escapeHtml (trimmed.Substring 2))}</li>"
    elif trimmed.StartsWith "#" then
        let level = trimmed.Length - trimmed.TrimStart('#').Length
        let text = trimmed.TrimStart('#').Trim()
        $"<h{min level 6}>{inlineToHtml (escapeHtml text)}</h{min level 6}>"
    else
        $"<div>{inlineToHtml (escapeHtml trimmed)}</div>"

/// Markdown z plánovače na HTML pro `System.Description`. Záměrně minimalistické
/// — ADO renderuje jednoduché HTML a složitější tvary by se při zpětné
/// konverzi stejně nedaly udržet stabilní.
let markdownToHtml (markdown: string | null) : string =
    match markdown with
    | null -> ""
    | value when String.IsNullOrWhiteSpace value -> ""
    | value ->
        value.Replace("\r\n", "\n").Split '\n'
        |> Array.map lineToHtml
        |> Array.filter (fun line -> line <> "")
        |> String.concat ""

// ── Porovnání popisů ────────────────────────────────────────────────────────

/// Řádek bez blokových značek markdownu — odrážka, číslování, nadpis, citace,
/// vodorovná čára.
let private stripLineMarkers (line: string) =
    line.Trim()
    |> replace "^([-*+]|\\d+[.)])\\s+" ""
    |> replace "^#{1,6}\\s*" ""
    |> replace "^>\\s*" ""
    |> replace "^(-{3,}|={3,}|\\*{3,})$" ""

/// Popis zredukovaný na **holý text** — bez značek a bez rozdílů v bílých
/// znacích.
///
/// Cesta popisu tam a zpět je ztrátová: plánovač drží markdown, ADO HTML, a
/// `markdownToHtml` ∘ `htmlToMarkdown` nevrátí totéž, co do ní vstoupilo —
/// prázdný řádek mezi odstavci zmizí, `1.` se vrátí jako `-`, nadpis přijde
/// s jinými mezerami. Porovnání tvaru proto hlásilo rozdíl u popisů, které se
/// liší jen tím, čím prošly, a sync nabízel „popis se liší" donekonečna —
/// i hned po tom, co ho uživatel sám sesynchronizoval.
///
/// Cena je vědomá: rozdíl **jen** ve formátování (tučné navíc, odrážka místo
/// odstavce) se nehlásí. Za tuhle slepotu se platí tím, že hlášené rozdíly
/// jsou skutečné.
let descriptionText (text: string | null) : string =
    match text with
    | null -> ""
    | value ->
        value.Replace("\r\n", "\n").Split '\n'
        |> Array.map stripLineMarkers
        |> String.concat " "
        |> replace "!?\\[([^\\]]*)\\]\\([^)]*\\)" "$1"
        |> replace "\\*\\*|__|~~|\\*|_|`" ""
        |> replace "\\s+" " "
        |> fun result -> result.Trim()

/// Shodují se popisy? Porovnává se text, ne formátování (`descriptionText`).
let areDescriptionsEqual (left: string | null) (right: string | null) =
    descriptionText left = descriptionText right

/// Otisk popisu do snapshotu. Port `computeDescriptionHashSync` — 32bitová
/// aritmetika včetně přetečení, aby hodnoty seděly s dřívějšími snapshoty.
let descriptionHash (text: string | null) : string =
    match text with
    | null -> ""
    | "" -> ""
    | value ->
        let normalized = (replace "\\s+" " " (value.ToLowerInvariant())).Trim()

        let folded =
            normalized
            |> Seq.fold (fun acc character -> (acc <<< 5) - acc + int character) 0

        // `abs Int32.MinValue` v .NET vyhodí výjimku; JS `Math.abs` vrátí
        // 2147483648. Přes int64 dostaneme stejný výsledek jako klient.
        let positive = abs (int64 folded)
        (sprintf "%x" positive).PadLeft(8, '0')
