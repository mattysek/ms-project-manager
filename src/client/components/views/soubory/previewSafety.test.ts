// Náhled přílohy nesmí vykreslit cizí obsah jako HTML (files.feature).
//
// XSS u příloh není jen o `Content-Disposition` na serveru — druhá polovina je
// **místo zobrazení**. Kamkoli se dostane obsah nebo metadata cizího souboru,
// musí projít sanitizací nebo escapováním. Nahrát jde od teď libovolný typ,
// takže tahle zábrana nese celou váhu.
import { describe, expect, it } from 'vitest';
import { sanitizeHtml, markdownToHtml } from '../../../utils/htmlMarkdownConverter';
import { getPreviewType } from './fileHelpers';
import type { FileRef } from '../../../types';

function file(over: Partial<FileRef>): FileRef {
  return {
    id: 'f1',
    name: 'soubor',
    mimeType: 'application/octet-stream',
    size: 10,
    addedAt: '2026-01-05T08:00:00Z',
    addedBy: 'u1',
    note: '',
    ...over,
  };
}

describe('náhled přílohy — sanitizace obsahu', () => {
  // @scenario: files.feature > Náhled nikde nevykreslí cizí obsah jako HTML
  it('Word náhled propouští jen sanitizovaný HTML', () => {
    // `mammoth` vrací HTML z .docx a to jde do `dangerouslySetInnerHTML` —
    // jediné, co mezi tím stojí, je `sanitizeHtml`.
    const fromDocx =
      '<p>Zpráva</p><script>alert(document.cookie)</script><img src=x onerror=alert(1)>';

    const safe = sanitizeHtml(fromDocx);

    expect(safe).toContain('Zpráva');
    expect(safe).not.toContain('<script');
    expect(safe).not.toContain('onerror');
  });

  it('markdown náhled propouští jen sanitizovaný HTML', () => {
    const malicious =
      '# Nadpis\n\n<script>alert(1)</script>\n\n<a href="javascript:alert(1)">klik</a>';

    const safe = markdownToHtml(malicious);

    expect(safe).toContain('Nadpis');
    expect(safe).not.toContain('<script');
    expect(safe).not.toContain('javascript:');
  });

  it('HTML příloha se nevykresluje jako HTML', () => {
    // `text` i `code` jdou do `<pre>{text}</pre>`, kde JSX escapuje samo —
    // podstatné je, že to NENÍ `markdown` ani `word`, tedy větve, které obsah
    // interpretují.
    const escapedAsText = ['text', 'code'];

    expect(escapedAsText).toContain(
      getPreviewType(file({ mimeType: 'text/html', name: 'stranka.html' }))
    );
    expect(escapedAsText).toContain(
      getPreviewType(file({ mimeType: 'application/xhtml+xml', name: 'a.xhtml' }))
    );
  });

  it('SVG jde do <img>, kde prohlížeč skripty nespouští', () => {
    // Nahrát SVG od teď jde, takže tahle větev je dosažitelná. Bezpečné to
    // není `Content-Disposition`em (ten `<img>` ignoruje), ale tím, že
    // prohlížeč v SVG načteném jako obrázek skripty ani externí odkazy
    // nespouští — a `<img>` nemá jak sáhnout na DOM aplikace.
    expect(getPreviewType(file({ mimeType: 'image/svg+xml', name: 'ikona.svg' }))).toBe('image');
  });

  it('typy s vlastním renderem HTML jsou jen dva a oba jdou přes sanitizaci', () => {
    expect(getPreviewType(file({ mimeType: 'text/markdown', name: 'a.md' }))).toBe('markdown');
    expect(
      getPreviewType(
        file({
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          name: 'a.docx',
        })
      )
    ).toBe('word');
  });
});
