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
      .btn{cursor:pointer;font-family:inherit;border-radius:6px;font-size:11px;padding:5px 13px;transition:all .15s;border:1px solid}
      .btn:hover:not(:disabled){filter:brightness(1.25)}
      .trow:hover td{background:#0f1a2a!important}
      textarea.inp{resize:vertical;min-height:60px;line-height:1.5}
      input[type=date].inp{cursor:pointer}
      input[type=color]{cursor:pointer}

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
