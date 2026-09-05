// Sdílené styly tříd `.btn`, `.inp` a spol.
//
// Aplikace nepoužívá CSS soubory — třídy se vkládají `<style>` blokem přímo
// z komponenty. Blok si ale dřív vyráběla každá stránka zvlášť
// (`AuthenticatedApp`, `LandingPage`, `AdminUsersPage`) a v každé kopii se
// trochu lišil. Kdo přidal čtvrtou stránku a na blok zapomněl, dostal
// nenastylovaná tlačítka — přesně to potkalo „Moje práce": `className="btn"`
// tam nemělo co odkazovat, takže tlačítka vypadala jako holé prvky prohlížeče.
//
// Odteď existuje jedno místo. Stránkově specifické doplňky (karty projektů,
// styly markdownu) zůstávají u svých komponent — sem patří jen to, co je
// společné.
export function AppStyles() {
  return (
    <style>{`
      *{box-sizing:border-box}
      ::-webkit-scrollbar{height:5px;width:5px;background:#0f1117}
      ::-webkit-scrollbar-thumb{background:#2d3748;border-radius:3px}
      .inp{background:#0c1018;border:1px solid #1e2533;border-radius:4px;color:#e2e8f0;font-family:inherit;font-size:11px;padding:3px 7px;outline:none;transition:border-color .15s}
      .inp:focus{border-color:#4f9cf9}
      .inp::placeholder{color:#334155}
      /* Pozor: tenhle blok je JS template literal, takže se sem nesmí dostat
         zpětný apostrof — ukončil by řetězec uprostřed CSS.

         .btn dřív nenastavovala barvy, jen tvar, takže holé class="btn"
         skončilo s výchozím tlačítkem prohlížeče na tmavé stránce. Nevšimlo
         se toho, protože všech 160 volajících si barvy posílalo inline;
         první, kdo je nepředal, dostal cizí prvek. Neutrální varianta je teď
         výchozí a pojmenované varianty níž jsou přesně ty kombinace, které
         už po aplikaci kolovaly. Inline style má pořád přednost, takže se tím
         žádné existující tlačítko nemění. */
      .btn{cursor:pointer;font-family:inherit;border-radius:6px;font-size:11px;padding:5px 13px;transition:all .15s;border:1px solid;background:#161b27;border-color:#2d3748;color:#94a3b8}
      .btn:hover:not(:disabled){filter:brightness(1.25)}
      .btn:disabled{opacity:.5;cursor:not-allowed}

      /* Hlavní akce obrazovky — právě jedna. */
      .btn-primary{background:#0d2210;border-color:#34d39966;color:#6ee7b7}
      /* Vedlejší akce, která má být přesto vidět (odkaz dál, náhled). */
      .btn-accent{background:#0c1a2a;border-color:#4f9cf944;color:#93c5fd}
      /* Nevratná akce. */
      .btn-danger{background:#2a1010;border-color:#f8717166;color:#f87171}
      /* Zapnutý přepínač — stejné barvy jako přepínače panelů v horní liště. */
      .btn-active{background:#0d1f38;border-color:#4f9cf9;color:#bfdbfe;font-weight:700}
      /* Tlačítko jen s ikonou v hustém řádku. */
      .btn-icon{padding:3px 8px}
      /* Rozcestník na úvodní obrazovce. */
      .btn-lg{font-size:13px;padding:10px 22px}
      .trow:hover td{background:#0f1a2a!important}
      textarea.inp{resize:vertical;min-height:60px;line-height:1.5}
      input[type=date].inp{cursor:pointer}
      input[type=color]{cursor:pointer}

      /* Popisky a hlášky formulářů. Bydlí tady, ne u přihlašovací stránky:
         používá je i trezor uvnitř aplikace (PRD-09) a dokud byly schované
         v <style> bloku AuthShellu, neexistovaly tam — popisky se pak
         vykreslily jako holý text prohlížeče. Přesně ten případ, kvůli
         kterému tenhle soubor vznikl. */
      .auth-label{display:flex;flex-direction:column;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
      .auth-error{background:#2a1010;border:1px solid #f8717155;border-radius:6px;padding:8px 12px;font-size:11px;color:#fca5a5}
      .auth-notice{background:#1a2a3a;border:1px solid #4f9cf955;border-radius:6px;padding:8px 12px;font-size:11px;color:#93c5fd;margin-bottom:12px}

        .markdown-content a {
          color: #4f9cf9;
          text-decoration: underline;
        }
        .markdown-content a:hover {
          color: #60a5fa;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
          color: #f1f5f9;
          margin: 0.5em 0 0.3em;
        }
        .markdown-content h1 { font-size: 1.3em; }
        .markdown-content h2 { font-size: 1.15em; }
        .markdown-content h3 { font-size: 1.05em; }
        .markdown-content p {
          margin: 0.4em 0;
        }
        .markdown-content ul, .markdown-content ol {
          margin: 0.4em 0;
          padding-left: 1.5em;
        }
        .markdown-content li {
          margin: 0.2em 0;
        }
        .markdown-content code {
          background: #1e2533;
          padding: 0.15em 0.4em;
          border-radius: 3px;
          font-size: 0.9em;
          color: #fcd34d;
        }
        .markdown-content pre {
          background: #1e2533;
          padding: 0.8em;
          border-radius: 6px;
          overflow-x: auto;
        }
        .markdown-content pre code {
          padding: 0;
          background: none;
        }
        .markdown-content blockquote {
          border-left: 3px solid #4f9cf9;
          margin: 0.5em 0;
          padding-left: 1em;
          color: #94a3b8;
        }
    `}</style>
  );
}
